# 🎬 Story Studio

A playful web app where **elementary school children write stories and watch them turn into animated movies**. The goal is to make the *revising and editing* part of creative writing genuinely fun: a child writes a story, gets friendly tips, generates a movie from it, and then improves the movie by making their writing more descriptive and clear.

## How it works

1. **Write** — the child types a story in a big, friendly editor.
2. **Helper Tips** — warm, age-appropriate feedback suggests ways to add description and clarity (powered by OpenAI).
3. **Make My Movie** — the story is broken into scenes, and each scene becomes a short video clip (powered by Replicate text-to-video).
4. **Revise & regenerate** — the child edits their story to be more vivid, then makes the movie again to see it improve.

## Practice Mode (no keys needed)

The app runs end-to-end **without any API keys**. In Practice Mode:

- Helper Tips come from a built-in encouraging coach.
- Scenes are rendered as colorful, animated placeholder cards with the child's narration.

This makes it easy to demo and develop the experience before wiring up paid AI services.

## Turning on real AI

1. Copy the env template:

```bash
cp .env.example .env.local
```

2. Fill in your keys in `.env.local`:
   - `OPENAI_API_KEY` — for writing feedback and scene breakdown.
   - `REPLICATE_API_TOKEN` — for generating real videos.
   - Optionally change `REPLICATE_VIDEO_MODEL` to any text-to-video model on Replicate.

3. Restart the dev server. The app automatically switches from Practice Mode to real AI when the keys are present.

## Running locally

```bash
npm install
npm run dev
```

Then open [http://localhost:3000](http://localhost:3000).

## Tech stack

- **Next.js (App Router) + TypeScript** — frontend and API routes in one app.
- **Tailwind CSS** — kid-friendly, colorful UI.
- **OpenAI** — writing feedback and story → scene breakdown.
- **Replicate** — text-to-video generation for each scene.

## Project structure

```
app/
  page.tsx            # Main writing + movie experience
  components/
    SceneCard.tsx     # Renders a single movie scene (video or animated placeholder)
  api/
    feedback/route.ts # POST story -> friendly writing tips
    movie/route.ts    # POST story -> scenes + starts video generation
    status/route.ts   # GET video generation status (polled by the client)
lib/
  ai.ts               # OpenAI + Replicate helpers, with offline mock fallbacks
  types.ts            # Shared types
```

## Safety note

All prompts instruct the AI to stay wholesome, positive, and age-appropriate for children ages 7–11. Review generated content before sharing it with students.
