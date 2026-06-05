import OpenAI from "openai";
import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { readFile, unlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import ffmpegPath from "ffmpeg-static";
import type { Rating } from "./types";

const OPENAI_API_KEY = process.env.OPENAI_API_KEY;

// --------------------------- Prompt guidelines ---------------------------

/** Strict G/PG rules for the youngest audience. */
export const PG_GUIDELINES = `CONTENT SAFETY RULES (must always follow):
- Keep everything strictly G/PG and appropriate for children ages 7-11.
- Absolutely NO nudity, sexual content, or romance beyond a friendly hug.
- NO profanity, swearing, slurs, or crude language.
- NO extreme or graphic violence, blood, gore, weapons used to harm, or death.
- NO horror, terror, or genuinely frightening imagery.
- NO drugs, alcohol, smoking, or gambling.
- NO hateful, discriminatory, or bullying content.
- Mild cartoon peril is okay only if it is clearly safe, silly, and resolves happily.
- Keep characters fully and modestly clothed at all times.
- The overall tone must be wholesome, kind, and fun, like a family animated film.`;

/** PG-13 rules for middle / early high school audiences. */
export const TEEN_GUIDELINES = `CONTENT SAFETY RULES (must always follow):
- Target a PG-13 level suitable for middle and early high school students (ages 11-15).
- Moderate, stylized action and adventure violence is allowed (e.g. cartoon
  combat, a bug getting smashed, monsters defeated, mild peril and stakes).
- NO graphic gore, no lingering on blood, no torture, no cruelty, and no
  realistic depictions of severe injury or death.
- NO sexual content or nudity; brief, non-explicit romance (like a kiss) is okay.
- Mild language is okay, but NO strong profanity, slurs, or hate speech.
- NO depiction or encouragement of drug use, self-harm, or suicide.
- Keep characters appropriately clothed.
- The overall tone should be exciting and engaging but still responsible for teens.`;

export function getGuidelines(rating: Rating): string {
  return rating === "teens" ? TEEN_GUIDELINES : PG_GUIDELINES;
}

// --------------------------- Local word filter ---------------------------

export type ModerationResult = {
  safe: boolean;
  /** Internal category labels that tripped, for logging. */
  categories: string[];
  /** A friendly, age-appropriate message to show if blocked. */
  kidMessage: string;
};

// Always-on local filter so Practice Mode (no API key) is still protected.
// Patterns are labeled by severity so each rating can choose what to block.
const LOCAL_PATTERNS: { label: string; regex: RegExp }[] = [
  {
    label: "profanity_strong",
    regex:
      /\b(f+u+c+k+|sh[i1]+t+|b[i1]tch|a+s+s+h+o+l+e+|b+a+s+t+a+r+d+|d[i1]ck|cunt|wank)\w*\b/i,
  },
  { label: "profanity_mild", regex: /\b(crap|piss|bollocks|bugger|damn|hell)\w*\b/i },
  {
    label: "slur",
    regex: /\b(n[i1]gg+(er|a)|f[a4]gg?(ot)?|ret[a4]rd|sp[i1]c|ch[i1]nk|k[i1]ke)\w*\b/i,
  },
  {
    label: "sexual",
    regex:
      /\b(sex|sexy|porn|naked|nude|nudity|boob|breast|penis|vagina|genital|orgasm|horny|erotic|rape|molest)\w*\b/i,
  },
  {
    label: "self_harm",
    regex: /\b(suicide|kill myself|self[\s-]?harm|cut myself)\w*\b/i,
  },
  {
    label: "violence_graphic",
    regex:
      /\b(behead|decapitat|dismember|disembowel|gore|bloodbath|torture|massacre|mutilat|slaughter|corpse)\w*\b/i,
  },
  {
    label: "violence_strong",
    regex: /\b(kill|murder|stab|shoot|gun|knife|hang(ed|ing)?)\w*\b/i,
  },
  { label: "substances_hard", regex: /\b(cocaine|heroin|meth|crack|fentanyl)\w*\b/i },
  {
    label: "substances_soft",
    regex: /\b(weed|marijuana|drunk|alcohol|beer|vodka|whiskey|cigarette|smoking|vape)\w*\b/i,
  },
];

/** Local categories each rating blocks. */
const LOCAL_BLOCK: Record<Rating, Set<string>> = {
  kids: new Set(LOCAL_PATTERNS.map((p) => p.label)),
  teens: new Set([
    "profanity_strong",
    "slur",
    "sexual",
    "self_harm",
    "violence_graphic",
    "substances_hard",
  ]),
};

// --------------------------- OpenAI policy ---------------------------

type OpenAiPolicy =
  | { mode: "flagged" }
  | { mode: "threshold"; thresholds: Record<string, number>; fallback: number };

const OPENAI_POLICY: Record<Rating, OpenAiPolicy> = {
  // Strictest: block whenever the model flags anything at all.
  kids: { mode: "flagged" },
  // PG-13: allow more action violence, keep everything else fairly strict.
  teens: {
    mode: "threshold",
    fallback: 0.8,
    thresholds: {
      sexual: 0.6,
      "sexual/minors": 0.15,
      harassment: 0.8,
      "harassment/threatening": 0.7,
      hate: 0.6,
      "hate/threatening": 0.5,
      illicit: 0.85,
      "illicit/violent": 0.9,
      "self-harm": 0.5,
      "self-harm/intent": 0.5,
      "self-harm/instructions": 0.4,
      violence: 0.92,
      "violence/graphic": 0.75,
    },
  },
};

// --------------------------- Messages ---------------------------

const FRIENDLY_BLOCK_MESSAGE =
  "Let's keep this story appropriate for the chosen audience. Try adjusting " +
  "that part \u2014 then we can make your movie. \uD83C\uDF1F";

const SCENE_BLOCK_MESSAGE =
  "We hid this scene to keep your movie appropriate for the chosen audience. " +
  "Try changing that part of your story and make your movie again! \uD83D\uDEE1\uFE0F";

// --------------------------- Local check ---------------------------

function localCheck(text: string, rating: Rating): ModerationResult {
  const block = LOCAL_BLOCK[rating];
  const categories: string[] = [];
  for (const { label, regex } of LOCAL_PATTERNS) {
    if (block.has(label) && regex.test(text)) categories.push(label);
  }
  return {
    safe: categories.length === 0,
    categories,
    kidMessage: categories.length === 0 ? "" : FRIENDLY_BLOCK_MESSAGE,
  };
}

type ModerationItem = {
  flagged: boolean;
  categories: Record<string, boolean | null>;
  category_scores: Record<string, number>;
};

/** Applies the rating's OpenAI policy to a single moderation result. */
function evaluateOpenAi(
  item: ModerationItem,
  rating: Rating
): { blocked: boolean; categories: string[] } {
  const policy = OPENAI_POLICY[rating];

  if (policy.mode === "flagged") {
    if (!item.flagged) return { blocked: false, categories: [] };
    const categories = Object.entries(item.categories || {})
      .filter(([, v]) => v)
      .map(([k]) => k);
    return { blocked: true, categories };
  }

  // threshold mode
  const tripped: string[] = [];
  const scores = item.category_scores || {};
  for (const [category, score] of Object.entries(scores)) {
    const limit = policy.thresholds[category] ?? policy.fallback;
    if (score >= limit) tripped.push(`${category}:${score.toFixed(2)}`);
  }
  return { blocked: tripped.length > 0, categories: tripped };
}

// --------------------------- Text moderation ---------------------------

/**
 * Checks text against the always-on local filter AND (when an OpenAI key is
 * present) the OpenAI Moderation API, using the policy for the given rating.
 */
export async function moderateText(
  text: string,
  rating: Rating = "kids"
): Promise<ModerationResult> {
  const local = localCheck(text, rating);
  if (!local.safe) return local;

  if (!OPENAI_API_KEY || !text.trim()) {
    return local; // safe per local filter
  }

  try {
    const client = new OpenAI({ apiKey: OPENAI_API_KEY });
    const result = await client.moderations.create({
      model: "omni-moderation-latest",
      input: text,
    });
    const item = result.results[0] as unknown as ModerationItem;
    const { blocked, categories } = evaluateOpenAi(item, rating);
    if (blocked) return { safe: false, categories, kidMessage: FRIENDLY_BLOCK_MESSAGE };
    return { safe: true, categories: [], kidMessage: "" };
  } catch (err) {
    console.error("OpenAI moderation failed, using local filter only:", err);
    return local;
  }
}

// ------------------------- Video frame moderation -------------------------

/** Downloads a remote video to a temp file (follows redirects). */
async function downloadToTemp(url: string): Promise<string | null> {
  try {
    const res = await fetch(url, { redirect: "follow" });
    if (!res.ok || !res.body) return null;
    const bytes = Buffer.from(await res.arrayBuffer());
    if (bytes.length === 0) return null;
    const path = join(tmpdir(), `vid-${randomUUID()}.mp4`);
    await writeFile(path, bytes);
    return path;
  } catch (err) {
    console.error("Video download failed:", err);
    return null;
  }
}

function runFfmpeg(inputPath: string, outPath: string, atSeconds: number) {
  return new Promise<boolean>((resolve) => {
    const proc = spawn(ffmpegPath as string, [
      "-y",
      "-ss",
      String(atSeconds),
      "-i",
      inputPath,
      "-frames:v",
      "1",
      "-q:v",
      "3",
      outPath,
    ]);
    const timer = setTimeout(() => {
      proc.kill("SIGKILL");
      resolve(false);
    }, 30_000);
    proc.on("error", (err) => {
      clearTimeout(timer);
      console.error("ffmpeg spawn error:", err);
      resolve(false);
    });
    proc.on("close", (code) => {
      clearTimeout(timer);
      resolve(code === 0);
    });
  });
}

/**
 * Extracts a single frame from a video URL using the bundled ffmpeg binary.
 * The video is downloaded first (more reliable than ffmpeg's HTTP handling),
 * then a frame is grabbed from the local file. Returns JPEG bytes or null.
 */
async function extractVideoFrame(
  videoUrl: string,
  atSeconds = 1
): Promise<Buffer | null> {
  if (!ffmpegPath) {
    console.error("ffmpeg binary path not resolved (ffmpeg-static).");
    return null;
  }

  const inputPath = await downloadToTemp(videoUrl);
  if (!inputPath) {
    console.error("Frame extract: video download failed.");
    return null;
  }
  const outPath = join(tmpdir(), `frame-${randomUUID()}.jpg`);

  // Try at the requested time, then fall back to the very first frame for
  // very short clips where seeking past the end would yield no frame.
  let ok = await runFfmpeg(inputPath, outPath, atSeconds);
  if (!ok) ok = await runFfmpeg(inputPath, outPath, 0);

  unlink(inputPath).catch(() => {});

  if (!ok) {
    console.error("Frame extract: ffmpeg produced no frame.");
    unlink(outPath).catch(() => {});
    return null;
  }
  try {
    return await readFile(outPath);
  } catch {
    return null;
  } finally {
    unlink(outPath).catch(() => {});
  }
}

/** Runs OpenAI image moderation on raw JPEG bytes for the given rating. */
async function moderateImageBuffer(
  jpeg: Buffer,
  rating: Rating
): Promise<ModerationResult> {
  if (!OPENAI_API_KEY) {
    // No image moderation provider available; text-level checks already ran.
    return { safe: true, categories: ["image_check_skipped"], kidMessage: "" };
  }
  try {
    const client = new OpenAI({ apiKey: OPENAI_API_KEY });
    const dataUrl = `data:image/jpeg;base64,${jpeg.toString("base64")}`;
    const result = await client.moderations.create({
      model: "omni-moderation-latest",
      input: [{ type: "image_url", image_url: { url: dataUrl } }],
    });
    const item = result.results[0] as unknown as ModerationItem;
    const { blocked, categories } = evaluateOpenAi(item, rating);
    if (blocked) return { safe: false, categories, kidMessage: SCENE_BLOCK_MESSAGE };
    return { safe: true, categories: [], kidMessage: "" };
  } catch (err) {
    console.error("Image moderation failed:", err);
    // Fail safe: if we cannot verify a real rendered frame, block it.
    return {
      safe: false,
      categories: ["image_check_error"],
      kidMessage: SCENE_BLOCK_MESSAGE,
    };
  }
}

/** Downloads an image URL and runs it through image moderation. */
export async function moderateImageUrl(
  imageUrl: string,
  rating: Rating = "kids"
): Promise<ModerationResult> {
  if (!OPENAI_API_KEY) {
    return { safe: true, categories: ["image_check_skipped"], kidMessage: "" };
  }
  try {
    const res = await fetch(imageUrl, { redirect: "follow" });
    if (!res.ok) {
      return {
        safe: false,
        categories: ["image_download_error"],
        kidMessage: SCENE_BLOCK_MESSAGE,
      };
    }
    const bytes = Buffer.from(await res.arrayBuffer());
    return moderateImageBuffer(bytes, rating);
  } catch (err) {
    console.error("Image URL moderation failed:", err);
    return {
      safe: false,
      categories: ["image_check_error"],
      kidMessage: SCENE_BLOCK_MESSAGE,
    };
  }
}

/**
 * Grabs a frame from a finished video and runs it through image moderation
 * using the policy for the given rating.
 */
export async function moderateVideoFrame(
  videoUrl: string,
  rating: Rating = "kids"
): Promise<ModerationResult> {
  const frame = await extractVideoFrame(videoUrl);
  if (!frame) {
    if (!OPENAI_API_KEY) {
      return { safe: true, categories: ["frame_unavailable"], kidMessage: "" };
    }
    // We have a moderation provider but couldn't read the frame: fail safe.
    return {
      safe: false,
      categories: ["frame_extract_error"],
      kidMessage: SCENE_BLOCK_MESSAGE,
    };
  }
  return moderateImageBuffer(frame, rating);
}

export { FRIENDLY_BLOCK_MESSAGE, SCENE_BLOCK_MESSAGE };
