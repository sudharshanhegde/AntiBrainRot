import { Router } from "express";
import { query, pool } from "../db.js";
import { requireAuth } from "../auth.js";
import { runJobsJob } from "../jobs/sync.js";
import { cleanupOldJobs } from "../jobs/cleanup.js";
import { requirementsExcerpt } from "../jobs/extract.js";

// Jobs board routes.
//
// This section is separate from the topic decks, Quick Bites, and Worth a
// Read: it surfaces scraped job and internship listings filtered strictly
// against the user's job-search profile, so the feed is curated — a 0-year
// user never sees a senior role, and the feed does not become an infinite
// dump of every listing. A job is shown only when ALL of these hold:
//   - location: an on-site job in the user's country, or a remote job open
//     worldwide or restricted to the user's country;
//   - graduation: a new-grad-specific posting's target year matches the
//     user's stated graduation year exactly;
//   - qualification: the user satisfies at least one of the posting's paths
//     (their education meets/exceeds the path's required level and their
//     experience falls within the path's range).
// The raw requirement text is also shown on every card so the user can verify
// the summary against the original wording.
//
// Routes:
//   GET  /api/jobs/profile          - the signed-in user's job profile
//   PUT  /api/jobs/profile          - save the job profile (first-open form)
//   GET  /api/jobs                  - the matched live feed for the user
//   GET  /api/jobs/applied-pending  - applications awaiting Yes/No feedback
//   POST /api/jobs/apply            - record an application before redirecting
//   POST /api/jobs/feedback         - record a "did this job still exist?" answer
//   POST /api/jobs/sync             - on-demand scrape (GENERATION_SECRET)

export const jobsRouter = Router();

// Education rank: phd(4) > master(3) > bachelor(2) > associate(1) > any(0).
// A path whose required level is <= the user's level is satisfied (the user
// "meets or exceeds" it). A posting with no stated degree ("any") is
// satisfied by everyone.
function educationRank(level) {
  switch (String(level || "").toLowerCase()) {
    case "phd":
      return 4;
    case "master":
      return 3;
    case "bachelor":
      return 2;
    case "associate":
      return 1;
    default:
      return 0; // "any" / none
  }
}

function toJob(r) {
  return {
    id: r.id,
    company: r.company,
    role: r.role,
    location: r.location,
    apply_url: r.apply_url,
    // A concise model-generated summary of the actual requirements/skills for
    // display. Falls back to the deterministic excerpt, then the raw text.
    requirements_summary: r.requirements_summary,
    requirements_text: requirementsExcerpt(r.raw_requirements_text),
    raw_requirements_text: r.raw_requirements_text,
    target_grad_year: r.target_grad_year,
    location_country: r.location_country,
    is_remote: r.is_remote,
    remote_restricted_to: r.remote_restricted_to,
    qualification_paths: r.qualification_paths || [],
  };
}

// GET /api/jobs/profile
jobsRouter.get("/profile", requireAuth, async (req, res) => {
  try {
    const { rows } = await query(
      `select job_country, job_years_experience, job_education_level,
              job_education_completed, job_graduation_year, job_past_internship,
              job_profile_completed_at
         from users where id = $1`,
      [req.userId]
    );
    const r = rows[0];
    if (!r || !r.job_profile_completed_at) {
      return res.json({ profile: null });
    }
    res.json({
      profile: {
        country: r.job_country,
        years_experience: r.job_years_experience,
        education_level: r.job_education_level,
        education_completed: r.job_education_completed,
        graduation_year: r.job_graduation_year,
        past_internship: r.job_past_internship,
      },
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "could not load job profile" });
  }
});

// PUT /api/jobs/profile
// body: the questionnaire fields; marks job_profile_completed_at so it is
// only asked once on first opening the tab.
jobsRouter.put("/profile", requireAuth, async (req, res) => {
  const {
    country,
    years_experience,
    education_level,
    education_completed,
    graduation_year,
    past_internship,
  } = req.body || {};

  const validEducation = ["associate", "bachelor", "master", "phd"];
  const years = Number(years_experience);
  if (!country || !Number.isInteger(years) || years < 0) {
    return res.status(400).json({ error: "country and a non-negative years_experience are required" });
  }
  if (!validEducation.includes(education_level)) {
    return res.status(400).json({ error: "education_level must be one of associate,bachelor,master,phd" });
  }
  const completed = education_completed === true;
  const gy = graduation_year == null || graduation_year === "" ? null : Number(graduation_year);
  if (gy !== null && !Number.isInteger(gy)) {
    return res.status(400).json({ error: "graduation_year must be an integer or null" });
  }

  const { rows } = await query(
    `update users set
       job_country = $2,
       job_years_experience = $3,
       job_education_level = $4,
       job_education_completed = $5,
       job_graduation_year = $6,
       job_past_internship = $7,
       job_profile_completed_at = now()
     where id = $1
     returning job_country, job_years_experience, job_education_level,
               job_education_completed, job_graduation_year, job_past_internship`,
    [
      req.userId,
      country,
      years,
      education_level,
      completed,
      gy,
      past_internship === true,
    ]
  );
  if (rows.length === 0) {
    return res.status(404).json({ error: "user not found" });
  }
  const r = rows[0];
  res.json({
    profile: {
      country: r.job_country,
      years_experience: r.job_years_experience,
      education_level: r.job_education_level,
      education_completed: r.job_education_completed,
      graduation_year: r.job_graduation_year,
      past_internship: r.job_past_internship,
    },
  });
});

// GET /api/jobs   (requireAuth)
//
// The matched feed. Requires a completed job profile (country + years +
// education); otherwise returns needs_profile so the UI can ask the
// first-open questions. Matching rules:
//   1. a qualification path satisfied by education level (>=) and experience
//      years (within the path's range);
//   2. if the job has a target_grad_year it must equal the user's stated
//      graduation year exactly;
//   3. the job's location_country equals the user's country, or it is remote
//      and open globally or restricted to the user's country.
jobsRouter.get("/", requireAuth, async (req, res) => {
  try {
    const profRes = await query(
      `select job_country, job_years_experience, job_education_level,
              job_graduation_year
         from users where id = $1`,
      [req.userId]
    );
    const p = profRes.rows[0];
    if (!p || !p.job_country || p.job_years_experience == null || !p.job_education_level) {
      return res.json({ status: "needs_profile", jobs: [] });
    }

    const country = String(p.job_country).toLowerCase();
    const years = p.job_years_experience;
    const userRank = educationRank(p.job_education_level);
    const gradYear = p.job_graduation_year;

    const { rows } = await query(
      `select j.id, j.company, j.role, j.location, j.apply_url,
              j.raw_requirements_text, j.requirements_summary, j.target_grad_year,
              j.location_country, j.is_remote, j.remote_restricted_to,
              coalesce(
                (select jsonb_agg(jsonb_build_object(
                   'education_level', qp.education_level,
                   'min_experience_years', qp.min_experience_years,
                   'max_experience_years', qp.max_experience_years))
                 from job_qualification_paths qp where qp.job_id = j.id), '[]'::jsonb
              ) as qualification_paths
         from jobs j
        where j.expired = false
          -- Strict matching against the user's profile: a job is shown only
          -- when it actually fits them, so the feed is curated and never an
          -- infinite dump of every listing.
          and (
            -- 1. Location must match the user's country.
            (
              j.is_remote = false
              and lower(j.location_country) = $1
            )
            or (
              j.is_remote = true
              and (j.remote_restricted_to is null or lower(j.remote_restricted_to) = $1)
            )
          )
          -- 2. If a job is new-grad specific, the user's graduation year must
          --    match it exactly (a 2027-targeted role never shows for a 2026
          --    graduate).
          and (
            j.target_grad_year is null
            or (j.target_grad_year = $4 and $4 is not null)
          )
          -- 3. The user must satisfy at least one qualification path: their
          --    education meets or exceeds the path's required level, and their
          --    experience falls within the path's range.
          and exists (
            select 1 from job_qualification_paths qp
             where qp.job_id = j.id
               and case lower(qp.education_level)
                     when 'phd' then 4 when 'master' then 3
                     when 'bachelor' then 2 when 'associate' then 1 else 0
                   end <= $2
               and qp.min_experience_years <= $3
               and (qp.max_experience_years is null or qp.max_experience_years >= $3)
          )
          -- 4. Never show a job the user has marked "not interested".
          and not exists (
            select 1 from job_user_flags f
             where f.user_id = $5 and f.job_id = j.id and f.interested = false
          )
        order by j.last_seen_at desc, j.id desc
        limit 200`,
      [country, userRank, years, gradYear, req.userId]
    );

    // Applied markers for the user.
    const appliedRes = await query(
      "select job_id from applied_jobs where user_id = $1",
      [req.userId]
    );
    const applied = new Set(appliedRes.rows.map((r) => r.job_id));

    // Jobs the user marked "interested" (for the card marker).
    const flagRes = await query(
      "select job_id from job_user_flags where user_id = $1 and interested = true",
      [req.userId]
    );
    const interested = new Set(flagRes.rows.map((r) => r.job_id));

    const jobs = rows.map((r) => ({
      ...toJob(r),
      applied: applied.has(r.id),
      interested: interested.has(r.id),
    }));
    res.json({ status: "ok", jobs });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "could not load the jobs feed" });
  }
});

// POST /api/jobs/apply   body: { job_id }
// Records that the user tapped Apply (a PENDING check, NOT yet a real
// application). The two questions are asked on a later visit; only when they
// answer "Did you apply? = Yes" does a row get added to applied_jobs ("My
// applications"). company/role are denormalized so the pending decision can
// be recorded even after the job is flagged expired.
jobsRouter.post("/apply", requireAuth, async (req, res) => {
  try {
    const jobId = Number(req.body?.job_id);
    if (!Number.isInteger(jobId)) {
      return res.status(400).json({ error: "job_id is required" });
    }
    const jobRes = await query(
      "select id, company, role, apply_url from jobs where id = $1 and expired = false",
      [jobId]
    );
    if (jobRes.rows.length === 0) {
      return res.status(404).json({ error: "job not found" });
    }
    const job = jobRes.rows[0];
    await query(
      `insert into job_apply_checks (user_id, job_id, company, role, answered)
       values ($1, $2, $3, $4, false)
       on conflict (user_id, job_id) do update set
         company = excluded.company, role = excluded.role, answered = false,
         could_apply = null, did_apply = null, updated_at = now()`,
      [req.userId, job.id, job.company, job.role]
    );
    res.json({ ok: true, apply_url: job.apply_url });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "could not record application" });
  }
});

// GET /api/jobs/applied-pending
// Jobs the user tapped Apply on but has NOT yet answered the two questions
// ("Could you apply?" / "Did you apply?"). Returned when they come back to
// the Jobs tab so the check can be asked before the feed continues.
jobsRouter.get("/applied-pending", requireAuth, async (req, res) => {
  try {
    const { rows } = await query(
      `select c.job_id, c.company, c.role, c.updated_at,
              j.apply_url, j.expired
         from job_apply_checks c
         left join jobs j on j.id = c.job_id
        where c.user_id = $1 and c.answered = false
        order by c.updated_at desc`,
      [req.userId]
    );
    const pending = rows.map((r) => ({
      job_id: r.job_id,
      company: r.company,
      role: r.role,
      tapped_at: r.updated_at,
      apply_url: r.apply_url,
      job_still_live: r.expired === false,
    }));
    res.json({ pending });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "could not load pending applications" });
  }
});

// POST /api/jobs/feedback   body: { job_id, could_apply: boolean, did_apply: boolean }
// Records the user's answers to the two pending questions for a job they
// tapped Apply on:
//   could_apply - was the posting live/reachable (Yes = it was actively
//                 hiring; No = stale/dead -> a listing-quality signal).
//   did_apply   - did they actually submit an application.
// Only when did_apply = true is a row inserted into applied_jobs ("My
// applications"). Runs in a transaction so the decision and (if any) the
// application are consistent.
jobsRouter.post("/feedback", requireAuth, async (req, res) => {
  try {
    const jobId = Number(req.body?.job_id);
    const couldApply = req.body?.could_apply;
    const didApply = req.body?.did_apply;
    if (!Number.isInteger(jobId) || typeof couldApply !== "boolean" || typeof didApply !== "boolean") {
      return res.status(400).json({ error: "job_id, could_apply, and did_apply are required" });
    }

    const checkRes = await query(
      `select company, role from job_apply_checks
        where user_id = $1 and job_id = $2`,
      [req.userId, jobId]
    );
    if (checkRes.rows.length === 0) {
      return res.status(404).json({ error: "no pending apply for this job" });
    }
    const { company, role } = checkRes.rows[0];

    const client = await pool.connect();
    try {
      await client.query("begin");
      // Mark the pending check as answered.
      await client.query(
        `update job_apply_checks set
           could_apply = $3, did_apply = $4, answered = true, updated_at = now()
         where user_id = $1 and job_id = $2`,
        [req.userId, jobId, couldApply, didApply]
      );
      // Only a real application (did_apply = Yes) goes into My applications.
      if (didApply) {
        await client.query(
          `insert into applied_jobs (user_id, job_id, company, role)
           values ($1, $2, $3, $4)
           on conflict do nothing`,
          [req.userId, jobId, company, role]
        );
      }
      await client.query("commit");
    } catch (err) {
      await client.query("rollback");
      throw err;
    } finally {
      client.release();
    }

    res.json({ ok: true, job_id: jobId, could_apply: couldApply, did_apply: didApply, saved: didApply });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "could not save feedback" });
  }
});

// POST /api/jobs/flag   body: { job_id, interested: boolean }
// Records whether the user is interested in a job. interested=false means
// "not interested", which permanently hides that posting from this user's
// feed. interested=true records interest (a saved/marked state). One row per
// (user, job), so tapping again just updates it.
jobsRouter.post("/flag", requireAuth, async (req, res) => {
  try {
    const jobId = Number(req.body?.job_id);
    const interested = req.body?.interested;
    if (!Number.isInteger(jobId) || typeof interested !== "boolean") {
      return res.status(400).json({ error: "job_id and a boolean interested are required" });
    }
    const jobRes = await query("select id from jobs where id = $1", [jobId]);
    if (jobRes.rows.length === 0) {
      return res.status(404).json({ error: "job not found" });
    }
    await query(
      `insert into job_user_flags (user_id, job_id, interested)
       values ($1, $2, $3)
       on conflict (user_id, job_id) do update set
         interested = excluded.interested, updated_at = now()`,
      [req.userId, jobId, interested]
    );
    res.json({ ok: true, job_id: jobId, interested });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "could not save your interest" });
  }
});

// GET /api/jobs/applied
// The user's full application history (every job they tapped Apply on), so
// they can review what they applied for — role + company + when, plus the
// current apply URL when the job is still live. Intentionally includes jobs
// that have since expired (company/role are denormalized on the application
// row precisely so history survives expiry).
jobsRouter.get("/applied", requireAuth, async (req, res) => {
  try {
    const { rows } = await query(
      `select a.job_id, a.company, a.role, a.applied_at,
              a.feedback_job_existed,
              j.apply_url, j.expired as job_expired
         from applied_jobs a
         left join jobs j on j.id = a.job_id
        where a.user_id = $1
        order by a.applied_at desc, a.id desc`,
      [req.userId]
    );
    const applied = rows.map((r) => ({
      job_id: r.job_id,
      company: r.company,
      role: r.role,
      applied_at: r.applied_at,
      job_existed: r.feedback_job_existed,
      job_still_live: r.job_expired === false,
      apply_url: r.apply_url,
    }));
    res.json({ applied });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "could not load applications" });
  }
});

// POST /api/jobs/sync   (header: Authorization: Bearer <GENERATION_SECRET>)
// On-demand scrape + extraction run. Protected like the other pipeline
// triggers. No hard daily cap here: it runs on demand for testing and is
// also invoked by the daily generation job.
jobsRouter.post("/sync", async (req, res) => {
  const expected = process.env.GENERATION_SECRET
    ? `Bearer ${process.env.GENERATION_SECRET}`
    : "";
  if (!expected || req.headers.authorization !== expected) {
    return res.status(401).json({ error: "unauthorized" });
  }
  try {
    const dryRun = req.query.dry_run === "1";
    // no_model=1 uses the deterministic extractor (no LLM) — for bulk
    // cold-start backfills that would stall the slow sequential model path.
    const noModel = req.query.no_model === "1";
    const result = await runJobsJob({ dryRun, noModel });
    // After a real scrape, also drop stale, unreferenced jobs past the
    // retention window so the table does not grow without bound.
    let cleanup = null;
    if (!dryRun) {
      try {
        cleanup = await cleanupOldJobs();
      } catch (err) {
        console.error("[jobs] cleanup failed during sync:", err.message);
      }
    }
    res.json({ ...result, cleanup });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "jobs sync failed" });
  }
});
