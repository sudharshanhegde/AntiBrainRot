# AntiBrainRot

AntiBrainRot is a swipeable learning app for computer science. Instead of a
feed of short videos, it gives you a feed of short, dense lessons. One card,
one concept. Swipe up to move to the next idea.

The goal is the good part of a short-form feed without the noise. No videos,
no infinite scroll of junk, no streaks or badges. Just a card that teaches
you something real, then the next one.

## What it feels like

- You pick a lane, your niche, for example a Computer Science major, and see
  the topics that belong to it.
- You pick a topic, for example Operating Systems, and get a deck of 10
  concepts, each followed immediately by a short quiz card that tests
  it, so a deck is 20 cards in the swipe sequence. A deck therefore
  takes roughly twice as long to get through; the quiz cards are a one
  tap to answer and fast to dismiss, so the added length is recall, not
  friction.
- You swipe through the deck. A card can be a plain explanation, a short
  code snippet, or a small diagram. After each concept comes a quiz:
  pick one of four options, get instant feedback, and move on. At the
  end of a deck you see how many of its quiz questions you got right
  (for example 8 / 10).
- When you finish a deck, the topic locks for 24 hours. Come back tomorrow
  for the next deck, which goes a little deeper.
- At the end of a deck you get a clear stopping point and one next action.
  There is also a surprise me option that picks a random topic for you.

Each deck is one step in a progression. Deck 0 is fundamentals. Deck 1 is
intermediate. Later decks go deeper into the subject.

## How the content is made

Content is made by an automated pipeline, not by hand and not while you
wait.

- Every day the pipeline reads the topic queue file, picks the next topic,
  and asks DeepSeek to write one new deck: 10 concept cards, each
  immediately followed by a quiz card that tests it, generated from its
  own knowledge.
- The deck goes through a validation pass, a separate model call plus
  mechanical checks (including quiz-specific checks: exactly one
  correct answer that matches an option, unique option text, no em
  dashes or emojis, and a fair question whose answer is derivable from
  the concept card it follows). Only decks that pass every check are
  published.
- Published decks land in the database and show up in the app. Nothing is
  generated while you use the app, which keeps serving cheap and fast.

Adding a topic is one line in the queue file. Add a slug, push, and the
pipeline picks it up on its next daily run. One topic gets one deck a day,
so over time every topic builds up a full progression of content.

## What is in the repo

- `frontend`: the app. React, Vite, Tailwind, and a PWA you can install to
  your home screen.
- `backend`: a thin Express API for topics, the feed, and progress.
- `pipeline`: the content generation and validation scripts and the topic
  queue.
- The database schema lives in `backend/src/schema.sql`.

## The design

The visual language is grounded in systems programming. Monospace type for
metadata and code, a clean reading typeface for the explanations, and a
small set of colors where each topic keeps one accent color, so you build a
visual association over time. The scroll works like native reels, each card
is a full page and the feed snaps between them. Motion is kept to one short
moment per card, and it respects reduced motion settings.

## Running it locally

You need a Postgres database and a DeepSeek API key.

- Backend: `cd backend`, create `backend/.env` from `backend/.env.example`
  with `DATABASE_URL`, `DEEPSEEK_API_KEY`, and `GENERATION_SECRET`, then
  `npm run dev`. It serves on http://localhost:4000.
- Frontend: `cd frontend`, then `npm run dev`. It serves on
  http://localhost:5173.
- Database: Postgres. Run it locally in Docker, or use a hosted Postgres
  such as Supabase (free tier). Apply `backend/src/schema.sql` to create
  the tables.

To trigger the daily generation locally:
`curl -X POST http://localhost:4000/api/generate -H "Authorization: Bearer <GENERATION_SECRET>"`

You can access for free here : `https://antibrainrotnobot.vercel.app/`

