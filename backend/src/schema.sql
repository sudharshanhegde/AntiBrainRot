-- AntiBrainRot schema (README.md data model).
-- Run against Postgres/Supabase:  psql "$DATABASE_URL" -f schema.sql

create table if not exists topics (
  id serial primary key,
  name text not null,
  slug text not null unique,
  accent text,
  blurb text
);

-- Topic queue columns: status (pending/complete), progress toward a deck
-- target, and the line position in pipeline/topics_queue.md.
alter table topics add column if not exists status text not null default 'pending';
alter table topics add column if not exists decks_generated integer not null default 0;
alter table topics add column if not exists target_decks integer not null default 18;
alter table topics add column if not exists queue_position integer;

create table if not exists decks (
  id serial primary key,
  topic_id integer not null references topics(id) on delete cascade,
  deck_index integer not null,
  difficulty text not null,
  generated_at timestamptz,
  reviewed_at timestamptz,
  unique (topic_id, deck_index)
);

create table if not exists cards (
  id serial primary key,
  deck_id integer not null references decks(id) on delete cascade,
  order_index integer not null,
  template text not null,
  title text not null,
  body text not null,
  code_snippet text,
  diagram_ref text,
  concept text,
  unique (deck_id, order_index)
);

-- Quiz card columns. Concept cards are type 'concept'
-- (the default) and keep the existing template/title/body layout; quiz
-- cards are type 'quiz' and carry question/options/correct_option_id.
-- tests_card_id names the order_index of the concept card the quiz tests
-- (within the same deck, always the immediately preceding card), which
-- stays resolvable before any database ids exist.
alter table cards add column if not exists type text not null default 'concept';
alter table cards add column if not exists question text;
alter table cards add column if not exists options jsonb;
alter table cards add column if not exists correct_option_id text;
alter table cards add column if not exists tests_card_id text;

-- One row per quiz answer, per user, per card. (user_id, card_id) is
-- unique so a user who revisits and changes an answer updates the same
-- row instead of accumulating duplicates; end-of-deck scoring aggregates
-- fresh from here rather than storing a running score.
create table if not exists quiz_answers (
  id serial primary key,
  user_id text not null,
  card_id integer not null references cards(id) on delete cascade,
  selected_option_id text not null,
  is_correct boolean not null,
  answered_at timestamptz not null default now(),
  unique (user_id, card_id)
);

create table if not exists user_progress (
  user_id text not null,
  topic_id integer not null references topics(id) on delete cascade,
  last_deck_index_completed integer not null default -1,
  last_completed_at timestamptz,
  niche text,
  primary key (user_id, topic_id)
);

-- Resume position within the current in-progress deck: the card the user
-- was on, saved throttled as they scroll and reset to 0 when a deck is
-- completed, so the next deck starts clean. Exists for both signed-in
-- users and guests (guests keep it in the local mirror instead).
alter table user_progress add column if not exists last_viewed_card_index integer not null default 0;

-- Concept-level coverage tracking for the automated pipeline. One row
-- per covered concept per topic, so generation never repeats a concept.
create table if not exists covered_concepts (
  id serial primary key,
  topic_id integer not null references topics(id) on delete cascade,
  concept_label text not null,
  deck_id integer references decks(id) on delete cascade,
  covered_at timestamptz not null default now(),
  unique (topic_id, concept_label)
);

-- Queryable history of automated generation runs, success or failure.
create table if not exists generation_runs (
  id serial primary key,
  topic_id integer references topics(id) on delete set null,
  topic_slug text,
  deck_index integer,
  status text not null,
  failure_reason text,
  tokens_used integer,
  ran_at timestamptz not null default now()
);

-- Authenticated accounts. id is the Supabase Auth user id (a UUID),
-- stored as text so it matches the existing user_id columns on
-- user_progress and quiz_answers. Only the minimal profile fields the
-- feature needs are kept: email, display name, and avatar. leaderboard_
-- opt_in defaults false: visibility is opt-in, never opt-out.
create table if not exists users (
  id text primary key,
  email text unique,
  display_name text,
  avatar_url text,
  leaderboard_opt_in boolean not null default false,
  created_at timestamptz not null default now()
);

-- Account-level daily streak: did this user complete at least one deck,
-- on any topic, today. One row per user, keyed by the
-- same Supabase Auth user id as users.id.
create table if not exists user_streaks (
  user_id text primary key references users(id) on delete cascade,
  current_streak integer not null default 0,
  longest_streak integer not null default 0,
  last_active_date date
);

-- Quick Bites: the low-commitment feed module . A
-- separate content shape sitting alongside the structured topic decks,
-- deliberately with none of their structure: no decks, no difficulty, no
-- quiz. Each row is one short, self-contained fact (40-60 words), loosely
-- tagged for variety rather than organized into a curriculum.
create table if not exists quick_bites (
  id serial primary key,
  tag text not null,
  body text not null,
  generated_date date not null,
  created_at timestamptz not null default now()
);

-- Per-user seen tracking so the Quick Bites feed does not repeat a card a
-- user has already scrolled past, even as the overall pool grows into the
-- thousands. Same anon/authenticated text user_id convention as the other
-- per-user tables.
create table if not exists quick_bites_seen (
  user_id text not null,
  quick_bite_id integer not null references quick_bites(id) on delete cascade,
  seen_at timestamptz not null default now(),
  primary key (user_id, quick_bite_id)
);

-- Dedupe mechanism for Quick Bites generation, the same idea as
-- covered_concepts for the topic decks: a short label per fact already
-- used, checked before generating new ones so the same fact never
-- resurfaces as the pool grows.
create table if not exists covered_facts (
  id serial primary key,
  fact_label text not null unique,
  tag text,
  covered_at timestamptz not null default now()
);

-- Worth a Read: a curated list of links worth reading, one per row.
-- Synced from pipeline/worth_a_read.md on the same daily run as the topic
-- queue (plus an on-demand endpoint), so there is no admin screen and no
-- file storage beyond the markdown queue. url is unique so re-parsing the
-- file never creates duplicates, and lines can be reordered or reformatted
-- without re-inserting everything.
create table if not exists worth_a_read (
  id serial primary key,
  title text not null,
  url text not null unique,
  note text,
  added_at timestamptz not null default now()
);

-- ============================================================
-- Jobs board
-- ============================================================
-- User-side job-search profile. Kept as columns on users (not a separate
-- one-time form) because they change over time: experience count and
-- graduation year both move. job_profile_completed_at marks that the
-- user has answered the first-open Jobs tab questionnaire, so it is only
-- asked once. country / education are stored as normalized display names
-- (e.g. 'India', 'bachelor'); graduation_year only matters when
-- job_education_completed is false.
alter table users add column if not exists job_country text;
alter table users add column if not exists job_years_experience integer;
alter table users add column if not exists job_education_level text;
alter table users add column if not exists job_education_completed boolean;
alter table users add column if not exists job_graduation_year integer;
alter table users add column if not exists job_past_internship boolean;
alter table users add column if not exists job_profile_completed_at timestamptz;

-- Canonical company identity. Multiple source records may point to the
-- same employer (aliases and product/business-unit duplicates), so the
-- canonical name lives here once and job_sources reference it by id.
create table if not exists companies (
  id serial primary key,
  name text not null unique,
  created_at timestamptz not null default now()
);

-- One row per scrape target, expanded beyond the one-line queue format so
-- a source keeps its own health state. source_type is greenhouse, lever,
-- ashby, smartrecruiters, or custom; source_identifier means the board
-- token (greenhouse), company slug (lever), job-board name (ashby),
-- company identifier (smartrecruiters), or canonical careers URL (custom).
-- consecutive_failures + the *_at timestamps drive source health so a
-- broken fetch is never mistaken for a company having zero jobs.
create table if not exists job_sources (
  id serial primary key,
  company_id integer references companies(id) on delete cascade,
  source_type text not null,
  source_identifier text not null,
  source_url text,
  enabled boolean not null default true,
  country_scope text,
  last_success_at timestamptz,
  last_failure_at timestamptz,
  consecutive_failures integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (source_type, source_identifier)
);

-- One row per daily scrape of one source, the observable result the daily
-- run records so failures are audit-able and expiry decisions are based on
-- real source runs, not guesses.
create table if not exists job_source_runs (
  id serial primary key,
  source_id integer references job_sources(id) on delete cascade,
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  status text, -- healthy | failed | disabled
  jobs_found integer not null default 0,
  jobs_inserted integer not null default 0,
  jobs_updated integer not null default 0,
  jobs_missing integer not null default 0,
  jobs_failed_validation integer not null default 0,
  error text
);

-- Live job listings. A row is never hard-deleted, only flagged expired,
-- because applied_jobs keeps a stable reference to it; the denormalized
-- company/role on applied_jobs protects the user's history regardless.
-- source_url is the dedupe key (stable source URL), with content_hash as
-- a fallback fingerprint. raw_requirements_text is preserved alongside the
-- extracted fields so a user can verify the structured summary against the
-- original requirement wording.
create table if not exists jobs (
  id serial primary key,
  source text not null,
  company text not null,
  role text not null,
  location text,
  apply_url text,
  source_url text unique,
  content_hash text,
  raw_requirements_text text,
  requirements_summary text,
  target_grad_year integer,
  location_country text,
  is_remote boolean not null default false,
  remote_restricted_to text,
  posted_at timestamptz,
  last_seen_at timestamptz not null default now(),
  expired boolean not null default false,
  created_at timestamptz not null default now()
);
create index if not exists jobs_live_idx on jobs (expired) where not expired;

-- A posting often accepts more than one qualification path ("bachelor's
-- plus 2 years, or master's plus 0 years"), so paths live in their own
-- table, one row per accepted path, matched against a user if they satisfy
-- any single row. education_level is one of bachelor/master/phd.
create table if not exists job_qualification_paths (
  id serial primary key,
  job_id integer not null references jobs(id) on delete cascade,
  education_level text not null,
  min_experience_years integer not null default 0,
  max_experience_years integer,
  unique (job_id, education_level, min_experience_years, max_experience_years)
);

-- User application history. company and role are denormalized here (not
-- only a foreign key to jobs) so a user's history survives even after the
-- job is later marked expired and hidden from the live feed.
create table if not exists applied_jobs (
  id serial primary key,
  user_id text not null,
  job_id integer not null references jobs(id),
  company text not null,
  role text not null,
  applied_at timestamptz not null default now()
);
create index if not exists applied_jobs_user_idx on applied_jobs (user_id);
-- A user applies to a given job at most once; the unique key lets the apply
-- route use on-conflict-do-nothing and makes the "Applied" marker cheap.
create unique index if not exists applied_jobs_user_job_idx
  on applied_jobs (user_id, job_id);

-- User-verification feedback: when a user returns to the Jobs tab after
-- applying, we ask "did this job still exist?" (Yes/No). feedback_job_existed
-- stores the answer and feedback_given_at marks it as answered so it is only
-- asked once per application. Aggregating "No" answers by job_id tells us
-- which listings users could not actually apply to, so stale/fake postings
-- can be removed or manually validated against this table at end of day.
alter table applied_jobs add column if not exists feedback_job_existed boolean;
alter table applied_jobs add column if not exists feedback_given_at timestamptz;
