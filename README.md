# AntiBrainRot

AntiBrainRot is a swipeable, reels-style learning app for computer science.
Instead of a feed of short videos, it gives you a feed of short, dense
lessons: one card, one concept, followed by a one-tap quiz. Swipe up to
move to the next idea.

The goal is the good part of a short-form feed without the noise: no
videos, no infinite scroll, no gamification tricks. Just a card that
teaches you something real, then the next one.

**Live app:** <https://antibrainrotnobot.vercel.app/>

## Features

- **Reels-style feed.** Cards are full-screen and snap between each other
  with native scroll snap. Swipe up for the next lesson.
- **Concept + quiz pairs.** Every concept card is followed by a short quiz
  that tests exactly what you just read. Answering is one tap with instant
  feedback.
- **Structured progression.** Each topic is a series of decks that move
  from fundamentals to advanced. Completing a deck starts a cooldown
  before the next deck unlocks (12 hours by default, configurable via
  `COOLDOWN_HOURS`), so the next deck is ready soon after.
- **Resume where you left off.** Opening a topic lands you on the exact
  card you were last on, restored before first paint.
- **Accounts, streaks, and leaderboard.** Google or email/password sign-in
  through Supabase, an account-level daily streak, an opt-in leaderboard,
  and a profile page.
- **Guest mode.** Use the app with no account at all; progress is kept in
  the browser.
- **Automated content.** Decks are generated and validated by an LLM
  pipeline before they ship. Nothing is generated while you use the app,
  which keeps serving cheap and fast.

## Tech stack

| Layer      | Technology                                        |
| ---------- | ------------------------------------------------- |
| Frontend   | React 19, Vite, Tailwind CSS                      |
| Backend    | Node.js, Express                                  |
| Database   | PostgreSQL (Supabase compatible)                  |
| Auth       | Supabase Auth (Google OAuth + email/password)     |
| Content    | DeepSeek API (OpenAI-compatible)                  |
| Scheduling | GitHub Actions cron to the backend generate API   |

## Repository layout

| Path                                   | Purpose                                            |
| -------------------------------------- | -------------------------------------------------- |
| [`frontend/`](frontend)                | The React app (feed, topics, profile, auth UI).    |
| [`backend/`](backend)                  | The Express API: topics, feed, progress, auth, leaderboard. |
| [`pipeline/`](pipeline)                | Offline content generation and validation.         |
| `.github/workflows/daily-generate.yml` | Daily trigger that calls the backend generate API. |

The database schema lives in [`backend/src/schema.sql`](backend/src/schema.sql)
and is idempotent (safe to re-apply).

## How content is made

Content is produced offline by an automated pipeline, never while a user is
waiting on a request.

### Daily generation (backend)

A GitHub Actions workflow runs once a day and calls
`POST /api/generate` on the deployed backend. The job:

1. Reads [`pipeline/topics_queue.md`](pipeline/topics_queue.md) and syncs it
   into the `topics` table.
2. Generates one new deck for every topic that is not yet complete.
3. Validates each deck with mechanical checks and a separate LLM pass.
4. Publishes decks that pass, in a single transaction.

To add a topic, append one slug to `pipeline/topics_queue.md` and push. The
pipeline picks it up on its next daily run.

### Source-grounded pipeline (offline)

[`pipeline/`](pipeline) is a local, source-grounded generator. It reads
curated reference material from `pipeline/sources/<topic>/`, tracks which
concepts are already covered in `pipeline/coverage/<topic>/manifest.json`,
and publishes reviewed decks to the backend through `POST /api/decks`.

## Getting started

Prerequisites: Node.js 20+, PostgreSQL, and a DeepSeek API key.

### 1. Database

Run PostgreSQL locally (for example with Docker) or use a hosted Supabase
project, then apply the schema:

```bash
psql "$DATABASE_URL" -f backend/src/schema.sql
```

### 2. Backend

```bash
cd backend
npm install
cp .env.example .env   # then fill in the values
npm run dev            # serves on http://localhost:4000
```

Backend environment variables (`backend/.env`):

| Variable | Purpose |
| --- | --- |
| `DATABASE_URL` | Postgres connection string |
| `DEEPSEEK_API_KEY` | DeepSeek API key, used by the generation job |
| `GENERATION_SECRET` | Shared secret protecting `POST /api/generate` and `POST /api/decks` |
| `SUPABASE_URL` | Supabase project URL (verifies JWTs on protected routes) |
| `SUPABASE_ANON_KEY` | Supabase public anon key |
| `CORS_ORIGIN` | Frontend origin(s) allowed to call the API |
| `SUPABASE_SERVICE_ROLE_KEY` | Optional; required only for account deletion |

### 3. Frontend

```bash
cd frontend
npm install
cp .env.example .env   # then fill in the values
npm run dev            # serves on http://localhost:5173
```

Frontend environment variables (`frontend/.env`):

| Variable | Purpose |
| --- | --- |
| `VITE_API_URL` | Base URL of the backend API |
| `VITE_SUPABASE_URL` | Supabase project URL |
| `VITE_SUPABASE_ANON_KEY` | Supabase public anon key |

Set `VITE_USE_MOCK=true` to serve local placeholder decks without a running
backend.

### 4. Content pipeline

```bash
cd pipeline
npm install
cp .env.example .env
npm run worker:dry     # print the prompts without calling DeepSeek
npm run worker:once    # generate, validate, and publish one cycle
```

See [`SKILL_pipeline.md`](SKILL_pipeline.md) for details.

## Auth setup (one-time)

Sign-in uses Supabase Auth with Google as the default provider and
email/password as a fallback. One-time configuration:

1. **Google Cloud Console**: create an OAuth 2.0 Client ID (Web
   application) for the app, then add the Supabase callback URI
   `https://<project-ref>.supabase.co/auth/v1/callback` as an authorized
   redirect URI.
2. **Supabase → Authentication → Providers → Google**: paste the Client ID
   and Client Secret and enable the provider.
3. **Supabase → Authentication → Providers → Email**: enable email/password
   for the manual login fallback.
4. Add the Supabase URL and keys to `backend/.env` and `frontend/.env` as
   described above.

## Deployment

- The frontend deploys to Vercel and the backend to Render. Set the
  environment variables listed above in each platform's settings.
- The `daily-generate` GitHub Actions workflow calls the backend's
  `/api/generate` endpoint once a day at 10:30 UTC (16:00 IST), after the
  main usage peaks. The backend enforces a once-per-day guard and refuses
  automatic runs before 15:30 IST. To force an on-demand run:

  ```bash
  curl -X POST "https://<backend>/api/generate?force=1" \
    -H "Authorization: Bearer <GENERATION_SECRET>"
  ```

## Contributing

The internal agent skills in the repository root (`SKILL.md`,
`SKILL_*.md`) document how the content pipeline and features are built.
They are gitignored and intended as development references, not shipped
documentation.

When contributing:

- Keep card content within the rules in `SKILL.md`: 100-200 word bodies,
  no em dashes, no emojis.
- Keep UI copy consistent with the frontend skill.
- Document any change that affects how the pipeline or features work.

## License

See the repository for license information.
