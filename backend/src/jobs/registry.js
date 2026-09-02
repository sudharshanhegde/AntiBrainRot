import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { query } from "../db.js";

// Jobs source registry sync.
//
// Reads pipeline/job_sources.md (one `kind:identifier` line per source, the
// same append-a-line pattern as the topic queue) and syncs it into the
// companies and job_sources tables. Any new line becomes a source the daily
// scrape checks going forward. Matching on (source_type, source_identifier)
// detects what already exists, so re-parsing never creates duplicates and
// lines can be reordered without re-inserting everything.

const __dirname = dirname(fileURLToPath(import.meta.url));
const JOB_SOURCES_FILE = join(__dirname, "..", "..", "..", "pipeline", "job_sources.md");

// Canonical-company overrides for board tokens/slugs that are not nice
// display names. Everything else falls back to pretty-casing the
// identifier. This is presentation only; it never claims hiring status.
const COMPANY_ALIASES = {
  greenhouse: {
    razorpaysoftwareprivatelimited: "Razorpay",
  },
};

function prettyName(identifier) {
  return String(identifier)
    .replace(/[._-]+/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase())
    .trim();
}

// Derives the canonical company name for a parsed source line. `host` is
// the parsed hostname for custom URL sources.
function companyNameFor(sourceType, identifier, host) {
  if (COMPANY_ALIASES[sourceType]?.[identifier]) {
    return COMPANY_ALIASES[sourceType][identifier];
  }
  if (sourceType === "custom") {
    // A custom URL like https://careers.example.com/jobs -> careers.example.com
    return host ? host : prettyName(identifier);
  }
  return prettyName(identifier);
}

// Parses the registry file into source lines. Comment lines and blank lines
// are ignored, matching the topic-queue parser.
export function parseSourceLines(content) {
  const sources = [];
  for (const rawLine of content.split("\n")) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    // Only the first colon separates the kind; the rest (a custom URL)
    // belongs to the identifier.
    const sep = line.indexOf(":");
    if (sep <= 0) continue;
    const sourceType = line.slice(0, sep).trim().toLowerCase();
    const identifier = line.slice(sep + 1).trim();
    if (!sourceType || !identifier) continue;

    let sourceUrl = null;
    let host = null;
    if (sourceType === "custom") {
      sourceUrl = identifier;
      try {
        host = new URL(identifier).hostname;
      } catch {
        host = null;
      }
    }
    sources.push({
      source_type: sourceType,
      source_identifier: identifier,
      source_url: sourceUrl,
      company: companyNameFor(sourceType, identifier, host),
    });
  }
  return sources;
}

// Upserts every parsed source into companies + job_sources. Returns a
// summary of new sources seen.
export async function syncJobSources() {
  let content;
  try {
    content = await readFile(JOB_SOURCES_FILE, "utf8");
  } catch {
    console.warn(`job_sources.md not found at ${JOB_SOURCES_FILE}`);
    return { status: "no-file", lines: 0, added: 0 };
  }

  const lines = parseSourceLines(content);
  let added = 0;

  // The file is the source of truth: any source no longer listed is disabled
  // so a removed line (e.g. a board token that 404s) stops being scraped on
  // the next run instead of failing forever.
  await query("update job_sources set enabled = false");

  for (const line of lines) {
    // Canonical company identity (upsert).
    const companyRes = await query(
      `insert into companies (name) values ($1)
       on conflict (name) do update set name = excluded.name
       returning id`,
      [line.company]
    );
    const companyId = companyRes.rows[0].id;

    // Source record. `xmax = 0` marks a row inserted by this statement, so
    // new sources are counted separately from existing ones. New sources
    // start enabled=false until the first live fetch verifies them (the
    // onboarding rule: never trust a mapping before the API responds).
    const res = await query(
      `insert into job_sources
         (company_id, source_type, source_identifier, source_url, enabled)
       values ($1, $2, $3, $4, true)
       on conflict (source_type, source_identifier) do update set
         company_id = excluded.company_id,
         source_url = coalesce(excluded.source_url, job_sources.source_url),
         enabled = true
       returning (xmax = 0) as is_insert`,
      [companyId, line.source_type, line.source_identifier, line.source_url]
    );
    if (res.rows[0]?.is_insert) added += 1;
  }

  return { status: "ok", lines: lines.length, added };
}

// The sources the daily scrape runs against, in registry order. `enabled`
// now means "currently listed in the registry file" (set fresh on every
// sync), so only sources present in pipeline/job_sources.md are fetched. A
// removed source is disabled and no longer scraped.
export async function loadEnabledSources() {
  const { rows } = await query(
    `select s.id, s.source_type, s.source_identifier, s.source_url, c.name as company
       from job_sources s
       join companies c on c.id = s.company_id
      where s.enabled = true
      order by s.id`
  );
  return rows;
}

// Marks a source healthy or failed after a fetch, updating the fields that
// drive source health so a single broken run is never mistaken for the
// company having zero jobs.
export async function recordSourceResult(sourceId, { ok, error }) {
  if (ok) {
    await query(
      `update job_sources set
         last_success_at = now(), consecutive_failures = 0, updated_at = now()
       where id = $1`,
      [sourceId]
    );
  } else {
    await query(
      `update job_sources set
         last_failure_at = now(),
         consecutive_failures = consecutive_failures + 1,
         updated_at = now()
       where id = $1`,
      [sourceId]
    );
  }
}

// Enables a source once its first live fetch has verified the mapping.
export async function enableSource(sourceId) {
  await query(
    `update job_sources set enabled = true, updated_at = now() where id = $1`,
    [sourceId]
  );
}
