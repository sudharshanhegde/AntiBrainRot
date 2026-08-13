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
