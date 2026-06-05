# 🎬 Story Studio

A playful web app where **elementary school children write stories and watch them turn into animated movies**. The goal is to make the *revising and editing* part of creative writing genuinely fun: a child writes a story, gets friendly tips, generates a movie from it, and then improves the movie by making their writing more descriptive and clear.

## How it works

1. **Write** — the student types a story in a big, friendly editor.
2. **Helper Tips** — warm, age-appropriate feedback suggests ways to add description and clarity (powered by OpenAI).
3. **Make Storyboard** — the story is broken into scenes, and each scene gets a **preview image** plus an editable description (images via Replicate text-to-image, which is fast and cheap to iterate on).
4. **Revise the storyboard** — the student edits each scene's title/description and **redraws** the image until they're happy with the visuals. This is where the editing-as-play happens.
5. **Make the Video** — once satisfied, the approved scenes are turned into short video clips (Replicate text-to-video). The approved image shows as a poster while each clip renders.
6. **Iterate** — the student can go back to the storyboard, refine, and re-render.

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
  page.tsx               # Main writing + storyboard + movie experience
  components/
    StoryboardCard.tsx   # Editable storyboard panel (image + description + redraw)
    SceneCard.tsx        # Renders a single movie scene (video or placeholder)
  api/
    feedback/route.ts    # POST story -> friendly writing tips
    storyboard/route.ts  # POST story -> scenes + preview images
    scene-image/route.ts # POST description -> a single redrawn image
    video/route.ts       # POST approved scenes -> starts video generation
    status/route.ts      # GET video generation status (polled by the client)
lib/
  ai.ts                  # OpenAI + Replicate helpers, with offline mock fallbacks
  safety.ts              # Rating-aware text/image/frame moderation
  types.ts               # Shared types
```

## Audience modes (content rating)

Story Studio supports two selectable audiences (chosen at the top of the writing panel; the choice is remembered):

- **Younger Kids — G/PG (ages ~7-11):** the strictest setting. Blocks profanity, slurs, sexual content, violence, scary content, drugs/alcohol, etc.
- **Teens — PG-13 (middle & early high school, ages ~11-15):** allows mild language and moderate, stylized action/cartoon violence (e.g. a bug getting smashed, fantasy combat, mild peril) while still blocking nudity, sexual content, strong profanity, slurs, **graphic gore**, hard drugs, and self-harm.

The selected rating drives three things: the AI generation guidelines, the text-moderation thresholds, and the video frame-check thresholds. For example, the story *"the knight smashed the giant bug in an epic battle"* is blocked for **Younger Kids** but allowed for **Teens**, while a *gory, bloody* story is blocked for **both**.

## Content safety

Every movie and every piece of writing feedback passes a safety check (at the selected rating) before anything is generated or shown. This is enforced with layers of defense:

1. **Strict PG instructions** are injected into every AI prompt (no nudity, profanity, extreme violence, horror, drugs/alcohol, hate, etc. — see `PG_GUIDELINES` in `lib/safety.ts`).
2. **The child's story is screened first.** If it fails the check, no movie/feedback is produced — instead a gentle "let's keep it kid-friendly" message invites them to try again.
3. **The AI-generated scene prompts are re-screened** before any text is sent to the video model.
4. **Two text screening layers run together:**
   - An **always-on local word filter** (works even in Practice Mode with no API keys).
   - The **OpenAI Moderation API** (`omni-moderation-latest`) when an `OPENAI_API_KEY` is present, which catches nuanced sexual, violent, hateful, and self-harm content.
5. **Finished videos get a frame check.** When a real video clip is ready, the server extracts a frame with a bundled `ffmpeg` binary (`ffmpeg-static`, no system install needed) and runs that image through OpenAI image moderation. If the rendered frame fails, the scene is hidden with a friendly "we hid this scene" message instead of being shown.

The system fails safe: if any layer flags the content (or a frame can't be verified when a moderation provider is configured), the content is blocked.

> Note: automated checks are strong but not perfect. For classroom use, an adult should still review generated movies before sharing them widely. Choosing a Replicate video model with its own provider-side safety filter adds further protection.
