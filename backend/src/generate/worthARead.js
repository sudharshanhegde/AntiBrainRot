import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { query } from "../db.js";

// Worth a Read sync (a markdown queue, same shape as the topic queue).
//
// Reads pipeline/worth_a_read.md, parses each markdown link line into a
// title, URL, and an optional note on why it is worth reading, and upserts
// them into the worth_a_read table. Matching on URL detects what is already
// synced, so re-running the parse never creates duplicates and lines can be
// reordered or reformatted without re-inserting everything. This step rides
// on the same daily run as the topic queue (no separate cron), and is also
// exposed through an on-demand endpoint so a freshly pushed entry can go
// live immediately without waiting for the next scheduled run.

const __dirname = dirname(fileURLToPath(import.meta.url));
const WORTH_A_READ_FILE = join(__dirname, "..", "..", "..", "pipeline", "worth_a_read.md");

// Matches a markdown link: [Title](url) optionally followed by an em/en dash
// (or hyphen) and a note. The note is captured but not validated; an entry
// with a title and a URL is enough to sync.
const LINK_RE = /\[([^\]]+)\]\(([^)]+)\)\s*(?:[—–-]\s*(.*))?$/;

// Parses the markdown file into { title, url, note } entries. Comment lines
// and blank lines are ignored, matching the topic-queue parser.
export function parseWorthARead(content) {
  const entries = [];
  for (const rawLine of content.split("\n")) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const m = LINK_RE.exec(line);
    if (!m) continue;
    const title = m[1].trim();
    const url = m[2].trim();
    if (!title || !url) continue;
    entries.push({ title, url, note: (m[3] || "").trim() });
  }
  return entries;
}

// Upserts every parsed entry into the database, matching on url. Returns a
// summary of how many lines were seen, inserted, and updated. `xmax = 0` in
// the RETURNING clause is true only for a row inserted by this statement (a
// conflict update touches the row, so xmax is non-zero), which is how new
// entries are counted separately from refreshed ones.
export async function syncWorthARead() {
  let content;
  try {
    content = await readFile(WORTH_A_READ_FILE, "utf8");
  } catch {
    console.warn(`worth_a_read.md not found at ${WORTH_A_READ_FILE}`);
    return { status: "no-file", entries: 0, inserted: 0, updated: 0 };
  }

  const entries = parseWorthARead(content);
  let inserted = 0;
  let updated = 0;
  for (const entry of entries) {
    const res = await query(
      `insert into worth_a_read (title, url, note)
       values ($1, $2, $3)
       on conflict (url) do update set
         title = excluded.title,
         note = excluded.note
       returning (xmax = 0) as is_insert`,
      [entry.title, entry.url, entry.note || null]
    );
    if (res.rows[0]?.is_insert) inserted += 1;
    else updated += 1;
  }

  return { status: "ok", entries: entries.length, inserted, updated };
}
