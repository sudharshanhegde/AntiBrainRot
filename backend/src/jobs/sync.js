import { query, pool } from "../db.js";
import {
  syncJobSources,
  loadEnabledSources,
  recordSourceResult,
  enableSource,
} from "./registry.js";
import { fetchSourceListings, isSupportedSourceType } from "./adapters.js";
import { parseListing } from "./extract.js";

// The daily jobs scrape and extraction pipeline.
//
// For each enabled source in the synced registry, fetch current listings via
// the platform's API, parse the structured fields directly from the source
// data (deterministic, no LLM) for any listing not already in the jobs
// table, insert the result (job + qualification paths), and finally expire
// listings this source no longer carries — but only after a couple of
// consecutive missed scrapes, and never because a single fetch failed.
//
// A broken source must never be interpreted as the company having zero jobs:
// a failed fetch only records a source-level failure and does not touch that
// company's jobs. Expiry only ever runs after a source has returned data.

// A listing not seen for this many days is treated as gone (the scrape runs
// daily, so ~2 missed consecutive runs), rather than a single failed fetch.
const MISSING_DAYS_TO_EXPIRE = 2;
const BETWEEN_SOURCES_MS = 1000; // short pause between sources to be polite

function sourceKey(source) {
  return `${source.source_type}:${source.source_identifier}`;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// Runs one source: fetch, then per-listing categorize (new vs seen), and for
// new listings extract + validate + insert. Returns run stats.
async function runOneSource(source, { dryRun }) {
  const startedAt = Date.now();
  const stats = {
    jobs_found: 0,
    jobs_inserted: 0,
    jobs_updated: 0,
    jobs_missing: 0,
    jobs_failed_validation: 0,
  };

  // Unknown/unsupported source types are skipped, not failed: keep the
  // source disabled and do not burn the run.
  if (!isSupportedSourceType(source.source_type)) {
    return { ...stats, status: "disabled", error: `unsupported source type: ${source.source_type}` };
  }

  let listings;
  try {
    const fetched = await fetchSourceListings(source);
    // Adapters return platform-shaped listings; stamp the source identity on
    // so insertJob can record where each job came from.
    listings = fetched.map((l) => ({
      ...l,
      source_type: source.source_type,
      source_identifier: source.source_identifier,
    }));
  } catch (err) {
    console.error(`[jobs] ${sourceKey(source)} fetch failed: ${err.message}`);
    await recordSourceResult(source.id, { ok: false, error: err.message });
    await logSourceRun(source.id, {
      startedAt,
      status: "failed",
      ...stats,
      error: err.message,
    });
    return { ...stats, status: "failed", error: err.message };
  }

  // The source responded: it is healthy and the mapping is verified.
  await recordSourceResult(source.id, { ok: true });
  await enableSource(source.id);

  stats.jobs_found = listings.length;
  const seenUrls = new Set();
  const seenRefs = new Set();

  for (const listing of listings) {
    if (listing.source_url) seenUrls.add(listing.source_url);
    if (listing.source_ref) seenRefs.add(listing.source_ref);

    const existing = await findExisting(listing);
    if (existing) {
      // Seen again: refresh timestamps and treat as active (not expired).
      await query(
        `update jobs set last_seen_at = now(), expired = false
          where id = $1`,
        [existing.id]
      );
      stats.jobs_updated += 1;
      continue;
    }

    if (dryRun) continue;

    // New listing: parse the structured fields directly (deterministic, no
    // LLM), with only a minimal sanity check before insert.
    const extracted = parseListing(listing);
    if (!extracted.role || !extracted.company || !listing.apply_url) {
      stats.jobs_failed_validation += 1;
      continue;
    }
    await insertJob(listing, extracted);
    stats.jobs_inserted += 1;
    // Be gentle with the ATS between listings.
    await sleep(50);
  }

  // Expiry: only after this source returned data successfully. A previously
  // known live job for this source/company that was NOT seen today and has
  // not been seen for MISSING_DAYS_TO_EXPIRE days is flagged expired (never
  // hard-deleted). A single failed run never reaches this point.
  const company = source.company;
  const threshold = new Date(Date.now() - MISSING_DAYS_TO_EXPIRE * 24 * 60 * 60 * 1000);
  let missing = 0;
  const liveRes = await query(
    `select id, source_url, last_seen_at from jobs
      where company = $1 and expired = false`,
    [company]
  );
  for (const row of liveRes.rows) {
    const seen = row.source_url ? seenUrls.has(row.source_url) : seenRefs.has(row.source_ref);
    if (!seen) {
      missing += 1;
      if (new Date(row.last_seen_at) < threshold) {
        await query("update jobs set expired = true where id = $1", [row.id]);
      }
    }
  }
  stats.jobs_missing = missing;

  const status = "healthy";
  await logSourceRun(source.id, { startedAt, status, ...stats, error: null });
  return { ...stats, status };
}

async function findExisting(listing) {
  if (listing.source_url) {
    const { rows } = await query(
      "select id from jobs where source_url = $1 limit 1",
      [listing.source_url]
    );
    if (rows[0]) return rows[0];
  }
  if (listing.content_hash) {
    const { rows } = await query(
      "select id from jobs where source_url is null and content_hash = $1 limit 1",
      [listing.content_hash]
    );
    if (rows[0]) return rows[0];
  }
  return null;
}

async function insertJob(listing, extracted) {
  const client = await pool.connect();
  try {
    await client.query("begin");
    const { rows } = await client.query(
      `insert into jobs
         (source, company, role, location, apply_url, source_url, content_hash,
          raw_requirements_text, target_grad_year, location_country, is_remote,
          remote_restricted_to, last_seen_at)
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12, now())
       returning id`,
      [
        `${listing.source_type}:${listing.source_identifier}`,
        extracted.company || listing.company,
        extracted.role,
        extracted.location,
        listing.apply_url,
        listing.source_url,
        listing.content_hash,
        listing.raw_text || null,
        extracted.target_grad_year,
        extracted.location_country,
        extracted.is_remote,
        extracted.remote_restricted_to,
      ]
    );
    const jobId = rows[0].id;
    for (const p of extracted.qualification_paths || []) {
      await client.query(
        `insert into job_qualification_paths
           (job_id, education_level, min_experience_years, max_experience_years)
         values ($1,$2,$3,$4)
         on conflict (job_id, education_level, min_experience_years, max_experience_years)
           do nothing`,
        [jobId, p.education_level, p.min_experience_years, p.max_experience_years]
      );
    }
    await client.query("commit");
  } catch (err) {
    await client.query("rollback");
    throw err;
  } finally {
    client.release();
  }
}

async function logSourceRun(sourceId, { startedAt, status, jobs_found, jobs_inserted, jobs_updated, jobs_missing, jobs_failed_validation, error }) {
  try {
    await query(
      `insert into job_source_runs
         (source_id, started_at, finished_at, status, jobs_found, jobs_inserted,
          jobs_updated, jobs_missing, jobs_failed_validation, error)
       values ($1, to_timestamp($2/1000.0), now(), $3, $4, $5, $6, $7, $8, $9)`,
      [
        sourceId,
        startedAt,
        status,
        jobs_found || 0,
        jobs_inserted || 0,
        jobs_updated || 0,
        jobs_missing || 0,
        jobs_failed_validation || 0,
        error || null,
      ]
    );
  } catch (err) {
    console.error("[jobs] could not log source run:", err.message);
  }
}

// Runs the full jobs job: sync the registry, then scrape each enabled
// source. Called from the daily generation run and an on-demand endpoint.
export async function runJobsJob({ dryRun = false } = {}) {
  const synced = await syncJobSources();
  const sources = await loadEnabledSources();
  const results = [];
  for (const source of sources) {
    try {
      const r = await runOneSource(source, { dryRun });
      results.push({ source: sourceKey(source), ...r });
    } catch (err) {
      console.error(`[jobs] ${sourceKey(source)} run error: ${err.message}`);
      results.push({ source: sourceKey(source), status: "error", error: err.message });
    }
    await sleep(BETWEEN_SOURCES_MS);
  }
  return { status: "ok", dryRun, synced, results };
}
