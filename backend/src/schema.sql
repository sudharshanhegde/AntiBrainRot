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
