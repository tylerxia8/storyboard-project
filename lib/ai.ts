import OpenAI from "openai";
import Replicate from "replicate";
import type { FeedbackResponse, Scene } from "./types";

const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const REPLICATE_API_TOKEN = process.env.REPLICATE_API_TOKEN;
const TEXT_MODEL = process.env.OPENAI_TEXT_MODEL || "gpt-4o-mini";
// Any text-to-video model on Replicate. Override via env to swap models.
const VIDEO_MODEL =
  (process.env.REPLICATE_VIDEO_MODEL as `${string}/${string}`) ||
  "wan-video/wan-2.2-t2v-fast";

export const hasTextAI = Boolean(OPENAI_API_KEY);
export const hasVideoAI = Boolean(REPLICATE_API_TOKEN);

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

// ----------------------------- Feedback -----------------------------

export async function getFeedback(story: string): Promise<FeedbackResponse> {
  const wordCount = countWords(story);

  if (!hasTextAI) {
    return mockFeedback(story, wordCount);
  }

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
            "You are a kind, encouraging writing coach for elementary school children (ages 7-11). " +
            "Always be warm and positive. Use simple words a child understands. Never be harsh. " +
            "Help them make their story more descriptive and clear so it would make a great movie. " +
            'Reply ONLY as JSON with this shape: {"praise": string, "suggestions": string[3], "sparkleWords": string[4]}. ' +
            "praise: one cheerful sentence about what they did well. " +
            "suggestions: 3 short, specific, friendly tips (each under 20 words) to add description or clarity. " +
            "sparkleWords: 4 fun descriptive words they could use in their story.",
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
      wordCount,
      mock: false,
    };
  } catch (err) {
    console.error("getFeedback failed, using mock:", err);
    return mockFeedback(story, wordCount);
  }
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
    wordCount,
    mock: true,
  };
}

// ----------------------------- Scenes -----------------------------

type RawScene = { title: string; narration: string; prompt: string };

export async function storyToScenes(story: string): Promise<{
  title: string;
  scenes: RawScene[];
}> {
  if (!hasTextAI) {
    return mockScenes(story);
  }

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
            "You turn a child's short story into a storyboard for an animated movie. " +
            "Break the story into 2-4 scenes that flow in order. " +
            'Reply ONLY as JSON: {"title": string, "scenes": [{"title": string, "narration": string, "prompt": string}]}. ' +
            "title: a fun movie title for the story. " +
            "narration: one friendly sentence describing the scene in the child's voice. " +
            "prompt: a vivid, detailed text-to-video prompt (describe characters, setting, action, mood, lighting, " +
            "and use a colorful 3D animated children's movie style). Keep it wholesome and age-appropriate.",
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
    if (scenes.length === 0) return mockScenes(story);
    return { title: String(parsed.title || "My Story Movie"), scenes };
  } catch (err) {
    console.error("storyToScenes failed, using mock:", err);
    return mockScenes(story);
  }
}

function mockScenes(story: string): { title: string; scenes: RawScene[] } {
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
  return { title: firstWords ? `${firstWords}...` : "My Story Movie", scenes };
}

// ----------------------------- Video -----------------------------

/** Starts a video generation for each scene. Returns Scene objects. */
export async function startScenes(rawScenes: RawScene[]): Promise<Scene[]> {
  return Promise.all(
    rawScenes.map(async (raw, index) => {
      const base: Scene = {
        id: `scene-${index + 1}-${Date.now()}`,
        title: raw.title,
        narration: raw.narration,
        prompt: raw.prompt,
        predictionId: null,
        status: "starting",
        videoUrl: null,
        mock: !hasVideoAI,
        palette: PALETTES[index % PALETTES.length],
      };

      if (!hasVideoAI) {
        // Offline placeholder: instantly "ready" as an animated scene card.
        return { ...base, status: "succeeded", mock: true };
      }

      try {
        const replicate = new Replicate({ auth: REPLICATE_API_TOKEN });
        const prediction = await replicate.predictions.create({
          model: VIDEO_MODEL,
          input: { prompt: raw.prompt },
        });
        return {
          ...base,
          predictionId: prediction.id,
          status: "processing",
        };
      } catch (err) {
        console.error("startScene failed, using placeholder:", err);
        return { ...base, status: "succeeded", mock: true };
      }
    })
  );
}

export async function getPredictionStatus(
  predictionId: string
): Promise<{ status: Scene["status"]; videoUrl: string | null }> {
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

    return { status, videoUrl };
  } catch (err) {
    console.error("getPredictionStatus failed:", err);
    return { status: "failed", videoUrl: null };
  }
}
