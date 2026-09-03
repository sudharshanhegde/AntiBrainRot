import { query } from "../db.js";

// Jobs-table retention.
//
// The jobs table is otherwise append-only by design: a row is only ever
// flagged `expired`, never hard-deleted, because applied_jobs /
// job_apply_checks / job_user_flags hold foreign keys to jobs(id) and the
// app surfaces that history to the user (My Applications survives even after
// a posting is removed).
//
// Left alone, every stale listing nobody ever touched stays in the table
// forever, and `raw_requirements_text` / `requirements_summary` are the
// bulk of the stored bytes. This cleanup reclaims that space safely: it
// permanently deletes only jobs that are
//   - already expired (no longer surfaced anywhere),
//   - older than the retention window (not seen in that long), and
//   - referenced by NO user activity (no application, no pending check, no
//     interest flag).
// Deleting a job cascades to its qualification paths (job_qualification_paths
// is `on delete cascade`), so no orphan rows are left behind. Anything a user
// has interacted with is always kept so their history never breaks.

export const JOB_RETENTION_DAYS = 10;

// Interval between automatic cleanup passes (ms). One pass a day is plenty for
// a 10-day retention window.
export const CLEANUP_INTERVAL_MS = 24 * 60 * 60 * 1000;

// Deletes stale, unreferenced, expired jobs. Returns how many rows were
// removed. Idempotent and safe to call whenever a sync runs or on a timer.
export async function cleanupOldJobs() {
  const { rows } = await query(
    `with stale as (
       select j.id
         from jobs j
        where j.expired = true
          and j.last_seen_at < now() - ($1 || ' days')::interval
          -- Never delete a job any user has interacted with: the app surfaces
          -- that history (applications, pending "did you apply?" checks, and
          -- interest markers), and those tables reference jobs(id).
          and not exists (select 1 from applied_jobs a where a.job_id = j.id)
          and not exists (select 1 from job_apply_checks c where c.job_id = j.id)
          and not exists (select 1 from job_user_flags f where f.job_id = j.id)
     )
     delete from jobs j
      using stale s
      where j.id = s.id
     returning j.id`,
    [JOB_RETENTION_DAYS]
  );
  return { deleted: rows.length, retentionDays: JOB_RETENTION_DAYS };
}

// Automatic maintenance loop: runs once on startup and then every
// CLEANUP_INTERVAL_MS. Idempotent, so multiple instances or an overlapping
// manual sync are harmless (a job deleted once is simply gone). Kept off by
// default unless explicitly enabled so a dev box does not surprise anyone;
// see scheduleJobCleanup().
export function scheduleJobCleanup() {
  const run = async () => {
    try {
      const res = await cleanupOldJobs();
      if (res.deleted > 0) {
        console.log(`[jobs] cleanup removed ${res.deleted} stale job(s)`);
      }
    } catch (err) {
      console.warn("[jobs] cleanup failed:", err.message);
    }
  };
  run();
  return setInterval(run, CLEANUP_INTERVAL_MS);
}
