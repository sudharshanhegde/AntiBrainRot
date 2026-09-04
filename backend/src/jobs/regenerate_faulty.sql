-- ---------------------------------------------------------------------------
-- Regenerate faulty experience data (run in the Supabase SQL editor / psql).
--
-- Background
-- ----------
-- Jobs are only inserted once per newly-seen listing; existing rows are never
-- re-extracted. So the ONLY way to make a wrong/faulty qualification row get
-- re-parsed by the new robust extractor is to DELETE it: once the row is gone,
-- the next daily scrape sees the source still carrying that URL, treats it as
-- a brand-new listing, and re-runs extraction (regex now, model reconciled).
--
-- What counts as "faulty" here
-- ----------------------------
-- A qualification path whose stored MINIMUM experience years is NOT a figure
-- the posting's own text ever states. That is the destructive failure mode:
-- a hallucinated/inflated/regressed number that hides a role from qualified
-- candidates (the classic "posting says 10+ years, table stores 2" regression).
-- A min of 0 is never wrong (it can only show MORE, never hide), so it is left
-- alone. Bounded valid ranges ("3-5 years" -> min 3, max 5) keep their min
-- because 3 IS stated in the text.
--
-- Safety
-- ------
-- 1. Run the DRY RUN (SELECT) first and eyeball the rows before deleting.
-- 2. The DELETE only removes NON-EXPIRED jobs and never touches a job any
--    user has interacted with (applications / pending apply-checks / interest
--    flags), matching the app's own retention policy. Deleting a job cascades
--    to its qualification paths (job_qualification_paths is ON DELETE CASCADE).
-- 3. Deleted jobs only come back if the source still lists them on the next
--    scrape. If a source dropped the posting, it simply stays gone (as it
--    would have been expired anyway).
-- ---------------------------------------------------------------------------


-- ===========================================================================
-- 1) DRY RUN — list every non-expired qualification row the rules would
--    delete, plus the years figures actually present in its text. Run this
--    first. If the list looks right, run block 2.
-- ===========================================================================
with stated as (
  select j.id as job_id,
         array(
           select n
           from (
             select (regexp_matches(
                      lower(
                        regexp_replace(
                          regexp_replace(coalesce(j.raw_requirements_text, ''),
                                         E'[\u2012\u2013\u2014\u2015]', '-', 'g'),
                          E'\\byrs?\\.?\\b', 'years', 'g')),
                      E'(\\d{1,2})\\s*(?:\\+)?\\s*years?', 'g'))[1]::int as n
           ) t
           where n < 40          -- ignore implausible figures ("30 years of history")
         ) as numbers
  from jobs j
)
select j.id            as job_id,
       j.company,
       j.role,
       j.source_url,
       qp.education_level,
       qp.min_experience_years,
       qp.max_experience_years,
       s.numbers        as "years_stated_in_text"
from jobs j
join job_qualification_paths qp on qp.job_id = j.id
join stated s             on s.job_id = j.id
where j.expired = false
  and qp.min_experience_years > 0
  and not (qp.min_experience_years = any (s.numbers))
  and not exists (select 1 from applied_jobs a      where a.job_id = j.id)
  and not exists (select 1 from job_apply_checks c  where c.job_id = j.id)
  and not exists (select 1 from job_user_flags f    where f.job_id = j.id)
order by j.company, j.role;


-- ===========================================================================
-- 2) DELETE — run this only after reviewing the dry run above. Removes the
--    faulty jobs (qualification paths cascade) so the next scrape regenerates
--    them with the robust extractor.
-- ===========================================================================
with stated as (
  select j.id as job_id,
         array(
           select n
           from (
             select (regexp_matches(
                      lower(
                        regexp_replace(
                          regexp_replace(coalesce(j.raw_requirements_text, ''),
                                         E'[\u2012\u2013\u2014\u2015]', '-', 'g'),
                          E'\\byrs?\\.?\\b', 'years', 'g')),
                      E'(\\d{1,2})\\s*(?:\\+)?\\s*years?', 'g'))[1]::int as n
           ) t
           where n < 40
         ) as numbers
  from jobs j
),
faulty as (
  select distinct j.id
  from jobs j
  join job_qualification_paths qp on qp.job_id = j.id
  join stated s                   on s.job_id = j.id
  where j.expired = false
    and qp.min_experience_years > 0
    and not (qp.min_experience_years = any (s.numbers))
    and not exists (select 1 from applied_jobs a      where a.job_id = j.id)
    and not exists (select 1 from job_apply_checks c  where c.job_id = j.id)
    and not exists (select 1 from job_user_flags f    where f.job_id = j.id)
)
delete from jobs j
using faulty f
where j.id = f.id
returning j.id;


-- ===========================================================================
-- 3) OPTIONAL REVIEW — every NON-EXPIRED job that currently carries a CEILING
--    (max_experience_years is not null). A bare "5 years of experience" is a
--    FLOOR, not a ceiling: a candidate with 8 years is still eligible, so max
--    must be NULL. If any row below stores a max on a posting whose text never
--    states an upper bound, it was wrongly capped and was hiding senior
--    candidates. Review this list, then delete the specific offending job ids
--    with the guarded one-liner at the bottom.
-- ===========================================================================
select j.id, j.company, j.role, j.source_url,
       qp.education_level,
       qp.min_experience_years,
       qp.max_experience_years
from jobs j
join job_qualification_paths qp on qp.job_id = j.id
where j.expired = false
  and qp.max_experience_years is not null
order by j.company, j.role;

-- 3b) Guarded manual delete for any <job_id> you confirm is wrongly capped:
-- delete from jobs where id = <job_id>
--   and not exists (select 1 from applied_jobs     a where a.job_id = <job_id>)
--   and not exists (select 1 from job_apply_checks c where c.job_id = <job_id>)
--   and not exists (select 1 from job_user_flags   f where f.job_id = <job_id>);
