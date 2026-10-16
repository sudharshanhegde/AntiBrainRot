import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { query } from "../db.js";
import { contentChat, GROQ_CONTENT_MODELS } from "../jobs/llm.js";
import { CARDS_PER_DECK } from "./checks.js";

// Per-topic syllabus for subject-based decks.
//
// One file per topic at pipeline/syllabus/<topic-slug>.md. Subject order is
// teaching order, bullet order is concept order:
//
//   ## array
//   - what an array is: contiguous memory, fixed size
//   - indexing and why access is O(1)
//
// The daily run parses the file and syncs it into the syllabus table. If a
// topic has no file, the first run asks the model once to draft one, stores
// it, and uses it; paste that draft into the file whenever you want control,
// and the file wins from then on. Concept selection then always continues
// the first subject in teaching order that still has pending concepts.

const __dirname = dirname(fileURLToPath(import.meta.url));
const SYLLABUS_DIR = join(__dirname, "..", "..", "..", "pipeline", "syllabus");

// Turn a subject slug into a display title ("linked-list" -> "Linked List").
export function humanizeSubject(slug) {
  return String(slug || "")
    .split(/[-_\s]+/)
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

// Parses the syllabus markdown into subjects. A "## <slug>" heading starts a
// subject; every "- <concept>" bullet under it is one concept, in order.
// Returns [] when the text has no subjects.
export function parseSyllabusMarkdown(text) {
  const subjects = [];
  let current = null;
  for (const raw of String(text || "").split("\n")) {
    const line = raw.trim();
    if (!line || line.startsWith("#!")) continue;
    const heading = line.match(/^#{1,6}\s+(.+)$/);
    if (heading && line.startsWith("##")) {
      const slug = heading[1].trim().toLowerCase().replace(/\s+/g, "-");
      current = { slug, title: humanizeSubject(slug), concepts: [] };
      subjects.push(current);
      continue;
    }
    if (line.startsWith("#")) continue;
    if (!current) continue;
    const bullet = line.match(/^[-*]\s+(.+)$/);
    if (bullet) current.concepts.push(bullet[1].trim());
  }
  return subjects.filter((s) => s.concepts.length > 0);
}

async function loadSyllabusFile(topicSlug) {
  let text;
  try {
    text = await readFile(join(SYLLABUS_DIR, `${topicSlug}.md`), "utf8");
  } catch {
    return null;
  }
  const subjects = parseSyllabusMarkdown(text);
  return subjects.length > 0 ? subjects : null;
}

async function draftSyllabus(topicSlug) {
  const prompt = `Draft a teaching syllabus for the topic "${topicSlug}" for a spaced-reading app. List the subjects a learner should meet, in teaching order (fundamentals before anything that depends on them), and for each subject list 5 to 10 concepts in the order they should be taught, one short line per concept. A concept line names what the card teaches, for example "indexing and why access is O(1)".

Reply with ONLY a single JSON object:
{
  "subjects": [
    {
      "slug": "lowercase-hyphenated-subject",
      "title": "Subject Title",
      "concepts": ["concept one", "concept two"]
    }
  ]
}`;
  // A syllabus spans several subjects of 5 to 10 concept lines each, so it
  // needs a much larger output bound than the small extraction default.
  const res = await contentChat(
    [
      { role: "system", content: "You design compact CS teaching syllabi. Reply with only the JSON object." },
      { role: "user", content: prompt },
    ],
    { temperature: 0.2, json: true, models: GROQ_CONTENT_MODELS, topic: topicSlug, maxTokens: 3000 }
  );
  const parsed = JSON.parse(res.content);
  return (parsed.subjects || [])
    .map((s) => ({
      slug: String(s.slug || "").trim().toLowerCase().replace(/\s+/g, "-"),
      title: String(s.title || humanizeSubject(s.slug)).trim(),
      concepts: (s.concepts || []).map((c) => String(c).trim()).filter(Boolean),
    }))
    .filter((s) => s.slug && s.concepts.length > 0);
}

// Upserts subjects into the syllabus table, preserving each concept's status
// (an already done concept stays done). Existing topics only get their
// ordering and title refreshed.
async function upsertSubjects(topicId, subjects) {
  for (let si = 0; si < subjects.length; si++) {
    const subject = subjects[si];
    for (let ci = 0; ci < subject.concepts.length; ci++) {
      await query(
        `insert into syllabus
           (topic_id, subject_slug, subject_title, subject_order, concept_order, concept_label, status)
         values ($1, $2, $3, $4, $5, $6, 'pending')
         on conflict (topic_id, subject_slug, concept_order) do update set
           subject_title = excluded.subject_title,
           subject_order = excluded.subject_order,
           concept_label = excluded.concept_label`,
        [topicId, subject.slug, subject.title, si, ci, subject.concepts[ci]]
      );
    }
  }
}

// Ensures the syllabus table is populated for a topic. File wins when it
// exists; otherwise an already-stored syllabus is reused; otherwise the model
// drafts one once and it is stored for every later run.
export async function syncSyllabus(topicSlug, topicId) {
  const fromFile = await loadSyllabusFile(topicSlug);
  if (fromFile) {
    await upsertSubjects(topicId, fromFile);
    return { source: "file", subjects: fromFile.length };
  }
  const existing = await query(
    "select count(*)::int as n from syllabus where topic_id = $1",
    [topicId]
  );
  if (existing.rows[0].n > 0) {
    return { source: "db", subjects: null };
  }
  const drafted = await draftSyllabus(topicSlug);
  if (drafted.length === 0) {
    return { source: "none", subjects: 0 };
  }
  await upsertSubjects(topicId, drafted);
  return { source: "drafted", subjects: drafted.length };
}

// Pure selection: given all syllabus rows for a topic, return the next
// assignment (the first subject in teaching order that still has pending
// concepts, and its next cardsPerDeck pending concepts), or null when every
// concept is done. partCount is the subject's total concepts divided by
// cardsPerDeck, rounded up.
export function pickNextAssignment(rows, cardsPerDeck) {
  const pending = (rows || []).filter((r) => r.status === "pending");
  if (pending.length === 0) return null;
  const first = pending.reduce((a, b) => (b.subject_order < a.subject_order ? b : a));
  const concepts = (rows || [])
    .filter((r) => r.subject_slug === first.subject_slug)
    .sort((a, b) => a.concept_order - b.concept_order);
  const assigned = concepts.filter((c) => c.status === "pending").slice(0, cardsPerDeck);
  return {
    subject: {
      slug: first.subject_slug,
      title: first.subject_title,
      subject_order: first.subject_order,
    },
    concepts: assigned.map((c) => c.concept_label),
    partCount: Math.ceil(concepts.length / cardsPerDeck),
  };
}

// The next deck's assignment for a topic, or null when the syllabus is
// exhausted. partNumber is the number of decks already published for the
// subject plus one.
export async function nextAssignment(topicId, cardsPerDeck = CARDS_PER_DECK) {
  const rowsRes = await query(
    `select subject_slug, subject_title, subject_order, concept_order, concept_label, status
       from syllabus where topic_id = $1
      order by subject_order, concept_order`,
    [topicId]
  );
  const picked = pickNextAssignment(rowsRes.rows, cardsPerDeck);
  if (!picked) return null;
  const publishedRes = await query(
    "select count(*)::int as n from decks where topic_id = $1 and subject_slug = $2",
    [topicId, picked.subject.slug]
  );
  return {
    subject: {
      slug: picked.subject.slug,
      title: picked.subject.title,
      partNumber: publishedRes.rows[0].n + 1,
      partCount: picked.partCount,
    },
    concepts: picked.concepts,
  };
}

// The running analogy stored on the subject's first published part, so every
// later part reuses the same picture. Null before part 1 exists.
export async function subjectAnalogyFor(topicId, subjectSlug) {
  const res = await query(
    `select subject_analogy from decks
      where topic_id = $1 and subject_slug = $2 and subject_analogy is not null
      order by part_number nulls last, deck_index
      limit 1`,
    [topicId, subjectSlug]
  );
  return res.rows[0] ? res.rows[0].subject_analogy : null;
}
