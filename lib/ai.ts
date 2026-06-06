import OpenAI from "openai";
import Replicate from "replicate";
import type {
  FeedbackResponse,
  Scene,
  Rating,
  StoryboardScene,
  StyleCharacter,
  StyleGuide,
  WritingTrait,
} from "./types";
import { getGuidelines, moderateImageUrl, moderateVideoFrame } from "./safety";

const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const REPLICATE_API_TOKEN = process.env.REPLICATE_API_TOKEN;
const TEXT_MODEL = process.env.OPENAI_TEXT_MODEL || "gpt-4o-mini";
// Any text-to-video model on Replicate. Override via env to swap models.
const VIDEO_MODEL =
  (process.env.REPLICATE_VIDEO_MODEL as `${string}/${string}`) ||
  "wan-video/wan-2.2-t2v-fast";
// Any text-to-image model on Replicate. Fast + cheap by default for iteration.
const IMAGE_MODEL =
  (process.env.REPLICATE_IMAGE_MODEL as `${string}/${string}`) ||
  "black-forest-labs/flux-schnell";
// Set REPLICATE_VIDEO_MODE=i2v (and point REPLICATE_VIDEO_MODEL at an
// image-to-video model) to animate the approved storyboard image directly,
// which keeps the video looking exactly like the storyboard.
const VIDEO_MODE = process.env.REPLICATE_VIDEO_MODE || "t2v";
// Different image-to-video models name their input differently (image,
// start_image, first_frame_image, ...). Override if your model needs another.
const VIDEO_IMAGE_KEY = process.env.REPLICATE_VIDEO_IMAGE_KEY || "image";

export const hasTextAI = Boolean(OPENAI_API_KEY);
export const hasVideoAI = Boolean(REPLICATE_API_TOKEN);
export const hasImageAI = Boolean(REPLICATE_API_TOKEN);

const PALETTES = [
  "from-sky-400 via-indigo-400 to-purple-500",
  "from-amber-300 via-orange-400 to-rose-500",
  "from-emerald-300 via-teal-400 to-cyan-500",
  "from-fuchsia-400 via-pink-400 to-rose-400",
  "from-lime-300 via-green-400 to-emerald-500",
  "from-violet-400 via-purple-400 to-indigo-500",
];

function countWords(text: string): number {
  return text.trim().split(/\s+/).filter(Boolean).length;
}

function splitIntoSentences(text: string): string[] {
  return text
    .replace(/\s+/g, " ")
    .match(/[^.!?]+[.!?]*/g)
    ?.map((s) => s.trim())
    .filter(Boolean) ?? [];
}

/**
 * Retries a Replicate call on HTTP 429 (rate limit), honoring the retry-after
 * header. Low-credit Replicate accounts are throttled to ~6 requests/minute
 * with a burst of 1, so we also create predictions sequentially.
 */
async function withRetry<T>(
  fn: () => Promise<T>,
  label: string,
  retries = 4
): Promise<T> {
  for (let attempt = 0; ; attempt++) {
    try {
      return await fn();
    } catch (err: unknown) {
      const response = (err as { response?: Response })?.response;
      const status = response?.status;
      if (status === 429 && attempt < retries) {
        const header = response?.headers?.get?.("retry-after");
        const waitMs = header ? (parseInt(header, 10) + 1) * 1000 : 11_000;
        console.warn(`${label}: rate limited, retrying in ${waitMs}ms`);
        await new Promise((r) => setTimeout(r, waitMs));
        continue;
      }
      throw err;
    }
  }
}

// ----------------------------- Feedback -----------------------------

export async function getFeedback(
  story: string,
  rating: Rating = "kids"
): Promise<FeedbackResponse> {
  const wordCount = countWords(story);

  if (!hasTextAI) {
    return mockFeedback(story, wordCount);
  }

  const audience =
    rating === "teens"
      ? "middle and early high school students (ages 11-15). Be encouraging and " +
        "respectful, not babyish. Use clear language appropriate for teens."
      : "elementary school children (ages 7-11). Always be warm and positive. " +
        "Use simple words a child understands. Never be harsh.";

  try {
    const client = new OpenAI({ apiKey: OPENAI_API_KEY });
    const completion = await client.chat.completions.create({
      model: TEXT_MODEL,
      temperature: 0.7,
      response_format: { type: "json_object" },
      messages: [
        {
          role: "system",
          content:
            `You are a kind, encouraging writing coach for ${audience} ` +
            "Help them make their story more descriptive and clear so it would make a great movie. " +
            'Reply ONLY as JSON with this shape: {"praise": string, "suggestions": string[3], "sparkleWords": string[4], "traits": [{"name": string, "stars": number, "tip": string}]}. ' +
            "praise: one cheerful sentence about what they did well. " +
            "suggestions: 3 short, specific, friendly tips (each under 20 words) to add description or clarity. " +
            "sparkleWords: exactly 4 fun, vivid descriptive words they could use in their story (this field is required and must contain 4 words). " +
            'traits: rate EXACTLY these 4 writing traits in this order: "Ideas & Details", "Word Choice", "Sentence Flow", "Voice & Feelings". ' +
            "For each, give stars as a whole number from 1 to 3 (be generous and encouraging; never give 0) and a tip under 15 words for growing that trait.\n\n" +
            getGuidelines(rating),
        },
        { role: "user", content: `Here is my story:\n\n${story}` },
      ],
    });

    const raw = completion.choices[0]?.message?.content || "{}";
    const parsed = JSON.parse(raw);
    return {
      praise: String(parsed.praise || "What a great start to your story!"),
      suggestions: Array.isArray(parsed.suggestions)
        ? parsed.suggestions.slice(0, 3).map(String)
        : [],
      sparkleWords: Array.isArray(parsed.sparkleWords)
        ? parsed.sparkleWords.slice(0, 4).map(String)
        : [],
      traits: Array.isArray(parsed.traits)
        ? parsed.traits.slice(0, 4).map(
            (t: Partial<WritingTrait>): WritingTrait => ({
              name: String(t.name || "Writing"),
              stars: Math.max(1, Math.min(3, Math.round(Number(t.stars) || 2))),
              tip: String(t.tip || ""),
            })
          )
        : [],
      wordCount,
      mock: false,
    };
  } catch (err) {
    console.error("getFeedback failed, using mock:", err);
    return mockFeedback(story, wordCount);
  }
}

function clampStars(n: number): number {
  return Math.max(1, Math.min(3, n));
}

function mockTraits(story: string, wordCount: number): WritingTrait[] {
  const sentences = splitIntoSentences(story);
  const describing = (
    story.match(
      /\b(red|orange|yellow|green|blue|purple|pink|black|white|brown|golden|silver|tiny|small|huge|giant|enormous|tall|short|long|shiny|sparkly|bright|dark|soft|fluffy|cold|hot|warm|loud|quiet|fast|slow|beautiful|scary|magical|gentle|fierce)\b/gi
    ) || []
  ).length;
  const feelings = /\b(happy|sad|scared|afraid|excited|angry|nervous|surprised|worried|proud|brave|lonely|curious|joyful)\b/i.test(
    story
  );

  return [
    {
      name: "Ideas & Details",
      stars: clampStars(wordCount >= 60 ? 3 : wordCount >= 25 ? 2 : 1),
      tip: "Add more about what happens and why it matters.",
    },
    {
      name: "Word Choice",
      stars: clampStars(describing >= 4 ? 3 : describing >= 1 ? 2 : 1),
      tip: "Swap plain words for vivid, sparkly ones.",
    },
    {
      name: "Sentence Flow",
      stars: clampStars(sentences.length >= 4 ? 3 : sentences.length >= 2 ? 2 : 1),
      tip: "Mix short and long sentences to keep it lively.",
    },
    {
      name: "Voice & Feelings",
      stars: clampStars(feelings ? 3 : wordCount >= 25 ? 2 : 1),
      tip: "Tell us how your characters feel inside.",
    },
  ];
}

function mockFeedback(story: string, wordCount: number): FeedbackResponse {
  const sentences = splitIntoSentences(story);
  const suggestions: string[] = [];

  if (wordCount < 25) {
    suggestions.push("Try adding more! What happened next in your story?");
  }
  if (!/\b(red|blue|green|tall|tiny|huge|shiny|dark|bright)\b/i.test(story)) {
    suggestions.push(
      "Add a color or size word so we can picture it (like 'a tiny green frog')."
    );
  }
  suggestions.push(
    "Tell us how your character feels. Are they happy, scared, or excited?"
  );
  if (sentences.length > 0) {
    suggestions.push(
      "Add a sound or a smell to one scene to bring it to life!"
    );
  }

  return {
    praise:
      wordCount > 0
        ? "Wonderful work! Your story has a great beginning and fun ideas."
        : "Let's start your amazing story! Type your first sentence above.",
    suggestions: suggestions.slice(0, 3),
    sparkleWords: ["sparkling", "enormous", "whispered", "suddenly"],
    traits: mockTraits(story, wordCount),
    wordCount,
    mock: true,
  };
}

// ----------------------------- Scenes -----------------------------

type RawScene = { title: string; narration: string; prompt: string };

type SceneBreakdown = {
  title: string;
  artStyle: string;
  characters: StyleCharacter[];
  scenes: RawScene[];
};

function defaultArtStyle(rating: Rating): string {
  return rating === "teens"
    ? "polished cinematic 3D animation, dynamic lighting, rich detailed color palette, PG-13"
    : "bright and colorful 3D animated children's movie, soft rounded shapes, warm friendly lighting";
}

export async function storyToScenes(
  story: string,
  rating: Rating = "kids"
): Promise<SceneBreakdown> {
  if (!hasTextAI) {
    return mockScenes(story, rating);
  }

  const styleNote =
    rating === "teens"
      ? "Use a polished, cinematic animated style suitable for teens; moderate " +
        "stylized action is okay, but keep it within PG-13."
      : "Use a colorful 3D animated children's movie style.";

  try {
    const client = new OpenAI({ apiKey: OPENAI_API_KEY });
    const completion = await client.chat.completions.create({
      model: TEXT_MODEL,
      temperature: 0.8,
      response_format: { type: "json_object" },
      messages: [
        {
          role: "system",
          content:
            "You turn a student's short story into a storyboard for an animated movie. " +
            "Break the story into 2-4 scenes that flow in order. " +
            'Reply ONLY as JSON: {"title": string, "artStyle": string, "characters": [{"name": string, "look": string}], "scenes": [{"title": string, "narration": string, "prompt": string}]}. ' +
            "title: a fun movie title for the story. " +
            "artStyle: ONE detailed sentence describing a single, consistent art style for the ENTIRE movie (medium, rendering, color palette, mood, lighting). The SAME style must be used for every scene. " +
            "characters: for EVERY important recurring character, give a fixed, detailed visual description (species/age, hair, skin/fur color, clothing colors, distinguishing features) so they look IDENTICAL in every scene. Each look under 25 words. " +
            "narration: one sentence describing the scene in the writer's voice. " +
            "prompt: a vivid text-to-video prompt focused on action, camera, setting, and mood. Refer to characters by name; do NOT restate their physical look or the art style (those are added automatically). " +
            styleNote +
            " If the story contains anything not suitable for the audience, gently rewrite that part to be appropriate.\n\n" +
            getGuidelines(rating),
        },
        { role: "user", content: `Story:\n\n${story}` },
      ],
    });

    const raw = completion.choices[0]?.message?.content || "{}";
    const parsed = JSON.parse(raw);
    const scenes: RawScene[] = Array.isArray(parsed.scenes)
      ? parsed.scenes.slice(0, 4).map((s: Partial<RawScene>) => ({
          title: String(s.title || "A Scene"),
          narration: String(s.narration || ""),
          prompt: String(s.prompt || ""),
        }))
      : [];
    if (scenes.length === 0) return mockScenes(story, rating);
    const characters: StyleCharacter[] = Array.isArray(parsed.characters)
      ? parsed.characters
          .slice(0, 6)
          .map((c: Partial<StyleCharacter>) => ({
            name: String(c.name || "").trim(),
            look: String(c.look || "").trim(),
          }))
          .filter((c: StyleCharacter) => c.name && c.look)
      : [];
    return {
      title: String(parsed.title || "My Story Movie"),
      artStyle: String(parsed.artStyle || defaultArtStyle(rating)),
      characters,
      scenes,
    };
  } catch (err) {
    console.error("storyToScenes failed, using mock:", err);
    return mockScenes(story, rating);
  }
}

function mockScenes(story: string, rating: Rating): SceneBreakdown {
  const sentences = splitIntoSentences(story);
  const chunks =
    sentences.length === 0
      ? ["Once upon a time, an adventure was about to begin."]
      : sentences;

  // Group sentences into up to 3 scenes.
  const sceneCount = Math.min(3, Math.max(1, Math.ceil(chunks.length / 2)));
  const perScene = Math.ceil(chunks.length / sceneCount);
  const scenes: RawScene[] = [];
  for (let i = 0; i < sceneCount; i++) {
    const part = chunks.slice(i * perScene, (i + 1) * perScene).join(" ");
    if (!part) continue;
    scenes.push({
      title: `Scene ${i + 1}`,
      narration: part,
      prompt: `Colorful 3D animated children's movie scene: ${part}`,
    });
  }

  const firstWords = chunks[0].split(" ").slice(0, 4).join(" ");
  return {
    title: firstWords ? `${firstWords}...` : "My Story Movie",
    artStyle: defaultArtStyle(rating),
    characters: [],
    scenes,
  };
}

// ------------------------- Images / Storyboard -------------------------

/**
 * Builds the shared consistency preamble (art style + locked character looks)
 * that gets prepended to every image and video prompt so the whole movie stays
 * visually consistent.
 */
function styleGuidePreamble(styleGuide?: StyleGuide): string {
  if (!styleGuide) return "";
  const chars =
    styleGuide.characters.length > 0
      ? " Characters must look IDENTICAL in every scene: " +
        styleGuide.characters
          .map((c) => `${c.name} — ${c.look}`)
          .join("; ") +
        "."
      : "";
  return `Consistent art style for the entire movie: ${styleGuide.artStyle}.${chars}`;
}

function buildVisualPrompt(
  description: string,
  rating: Rating,
  styleGuide?: StyleGuide
): string {
  const fallback =
    rating === "teens"
      ? "Polished cinematic animated film still, detailed and dynamic, PG-13."
      : "Bright, colorful, friendly 3D animated children's movie still.";
  const preamble = styleGuidePreamble(styleGuide) || fallback;
  // Lead with this scene's own action so each panel is a distinct picture,
  // then the shared style/character preamble keeps them on-model.
  return `Scene: ${description}. ${preamble}`;
}

function buildVideoPrompt(
  description: string,
  rating: Rating,
  styleGuide?: StyleGuide
): string {
  const fallback =
    rating === "teens"
      ? "Cinematic animated film clip with smooth motion, PG-13."
      : "Colorful, friendly 3D animated children's movie clip with smooth motion.";
  const preamble = styleGuidePreamble(styleGuide) || fallback;
  return `Scene: ${description}. ${preamble}`;
}

async function generateImage(prompt: string): Promise<string | null> {
  if (!hasImageAI) return null;
  try {
    const replicate = new Replicate({
      auth: REPLICATE_API_TOKEN,
      useFileOutput: false,
    });
    // No fixed seed: a fresh seed each time gives each scene its own
    // composition, while the prompt keeps characters and style consistent.
    const output = await withRetry(
      () =>
        replicate.run(IMAGE_MODEL, {
          input: {
            prompt,
            aspect_ratio: "16:9",
            output_format: "jpg",
            num_outputs: 1,
          },
        }),
      "generateImage"
    );
    if (typeof output === "string") return output;
    if (Array.isArray(output) && output.length > 0) return String(output[0]);
    return null;
  } catch (err) {
    console.error("generateImage failed:", err);
    return null;
  }
}

/** Generates one moderated storyboard image for an (edited) description. */
export async function generateSceneImage(
  description: string,
  rating: Rating = "kids",
  styleGuide?: StyleGuide
): Promise<{ imageUrl: string | null; imageBlocked?: boolean; mock: boolean }> {
  if (!hasImageAI) return { imageUrl: null, mock: true };
  const url = await generateImage(buildVisualPrompt(description, rating, styleGuide));
  if (!url) return { imageUrl: null, mock: true };
  const check = await moderateImageUrl(url, rating);
  if (!check.safe) return { imageUrl: null, imageBlocked: true, mock: false };
  return { imageUrl: url, mock: false };
}

/**
 * Builds the storyboard scene breakdown WITHOUT images, so the UI can render
 * the scenes immediately and then stream each preview image in one at a time
 * (via generateSceneImage / the /api/scene-image route).
 */
export async function buildStoryboardScenes(
  story: string,
  rating: Rating = "kids"
): Promise<{
  title: string;
  scenes: StoryboardScene[];
  styleGuide: StyleGuide;
  mock: boolean;
}> {
  const { title, artStyle, characters, scenes: rawScenes } =
    await storyToScenes(story, rating);
  const stamp = Date.now();
  const styleGuide: StyleGuide = { artStyle, characters };
  const scenes: StoryboardScene[] = rawScenes.map((raw, index) => ({
    id: `panel-${index + 1}-${stamp}`,
    title: raw.title,
    description: raw.narration || raw.prompt,
    imageUrl: null,
    palette: PALETTES[index % PALETTES.length],
    mock: !hasImageAI,
  }));
  return { title, scenes, styleGuide, mock: !hasImageAI };
}

// ----------------------------- Video -----------------------------

export type VideoSceneInput = {
  id?: string;
  title: string;
  description: string;
  palette?: string;
  imageUrl?: string | null;
};

/** Starts a video generation for each (approved, possibly edited) scene. */
export async function startScenes(
  inputs: VideoSceneInput[],
  rating: Rating = "kids",
  styleGuide?: StyleGuide
): Promise<Scene[]> {
  const replicate = hasVideoAI
    ? new Replicate({ auth: REPLICATE_API_TOKEN })
    : null;

  // Sequential creation respects low-credit Replicate rate limits (burst 1).
  const scenes: Scene[] = [];
  for (let index = 0; index < inputs.length; index++) {
    const input = inputs[index];
    const prompt = buildVideoPrompt(input.description, rating, styleGuide);
    const base: Scene = {
      id: input.id || `scene-${index + 1}-${Date.now()}`,
      title: input.title,
      narration: input.description,
      prompt,
      imageUrl: input.imageUrl ?? null,
      predictionId: null,
      status: "starting",
      videoUrl: null,
      mock: !hasVideoAI,
      palette: input.palette || PALETTES[index % PALETTES.length],
    };

    if (!replicate) {
      scenes.push({ ...base, status: "succeeded", mock: true });
      continue;
    }

    // Build model input. In image-to-video mode, animate the approved
    // storyboard image so the clip matches the storyboard exactly.
    const modelInput: Record<string, unknown> = { prompt };
    if (VIDEO_MODE === "i2v" && input.imageUrl) {
      modelInput[VIDEO_IMAGE_KEY] = input.imageUrl;
    }

    try {
      const prediction = await withRetry(
        () =>
          replicate.predictions.create({ model: VIDEO_MODEL, input: modelInput }),
        "startScene"
      );
      scenes.push({ ...base, predictionId: prediction.id, status: "processing" });
    } catch (err) {
      console.error("startScene failed, using placeholder:", err);
      scenes.push({ ...base, status: "succeeded", mock: true });
    }
  }
  return scenes;
}

export async function getPredictionStatus(
  predictionId: string,
  rating: Rating = "kids"
): Promise<{
  status: Scene["status"];
  videoUrl: string | null;
  safetyBlocked?: boolean;
}> {
  if (!hasVideoAI) {
    return { status: "succeeded", videoUrl: null };
  }
  try {
    const replicate = new Replicate({ auth: REPLICATE_API_TOKEN });
    const prediction = await replicate.predictions.get(predictionId);
    const output = prediction.output;
    let videoUrl: string | null = null;
    if (typeof output === "string") videoUrl = output;
    else if (Array.isArray(output) && output.length > 0)
      videoUrl = String(output[output.length - 1]);

    const status: Scene["status"] =
      prediction.status === "succeeded"
        ? "succeeded"
        : prediction.status === "failed" || prediction.status === "canceled"
          ? "failed"
          : "processing";

    // Final guardrail: PG-check an actual frame of the finished video before
    // ever showing it to a child. If it fails, hide the scene.
    if (status === "succeeded" && videoUrl) {
      const frameCheck = await moderateVideoFrame(videoUrl, rating);
      if (!frameCheck.safe) {
        console.warn("Scene hidden by frame check:", frameCheck.categories);
        return { status: "failed", videoUrl: null, safetyBlocked: true };
      }
    }

    return { status, videoUrl };
  } catch (err) {
    console.error("getPredictionStatus failed:", err);
    return { status: "failed", videoUrl: null };
  }
}
