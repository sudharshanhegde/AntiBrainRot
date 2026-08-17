-- AntiBrainRot schema (README.md data model).
-- Run against Postgres/Supabase:  psql "$DATABASE_URL" -f schema.sql

create table if not exists topics (
  id serial primary key,
  name text not null,
  slug text not null unique,
  accent text,
  blurb text
);

-- Topic queue columns (SKILL_topic_queue.md): status, progress toward a
-- deck target, and the line position in pipeline/topics_queue.md.
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

-- Quiz card columns (SKILL_quiz.md). Concept cards are type 'concept'
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

-- Authenticated accounts (SKILL_auth.md). id is the Supabase Auth user
-- id (a UUID), stored as text so it matches the existing user_id columns
-- on user_progress and quiz_answers. Only the minimal profile fields the
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

-- Account-level daily streak (SKILL_auth.md): did this user complete at
-- least one deck, on any topic, today. One row per user, keyed by the
-- same Supabase Auth user id as users.id.
create table if not exists user_streaks (
  user_id text primary key references users(id) on delete cascade,
  current_streak integer not null default 0,
  longest_streak integer not null default 0,
  last_active_date date
);
