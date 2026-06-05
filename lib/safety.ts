import OpenAI from "openai";
import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { readFile, unlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import ffmpegPath from "ffmpeg-static";

const OPENAI_API_KEY = process.env.OPENAI_API_KEY;

/**
 * PG content rules injected into every generation prompt. Mirrors common
 * PG-movie guidance: nothing a parent would find unsuitable for children.
 */
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

export type ModerationResult = {
  safe: boolean;
  /** Internal category labels that tripped, for logging. */
  categories: string[];
  /** A gentle, kid-friendly message to show if blocked. */
  kidMessage: string;
};

// Always-on local filter so Practice Mode (no API key) is still protected.
// Patterns are matched case-insensitively with word boundaries where helpful.
const LOCAL_PATTERNS: { label: string; regex: RegExp }[] = [
  {
    label: "profanity",
    regex:
      /\b(f+u+c+k+|sh[i1]+t+|b[i1]tch|a+s+s+h+o+l+e+|b+a+s+t+a+r+d+|d[i1]ck|piss|cunt|wank|bollocks|bugger|crap)\w*\b/i,
  },
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
    label: "violence",
    regex:
      /\b(kill|murder|stab|shoot|gun|knife|behead|decapitat|slaughter|torture|massacre|suicide|gore|bloodbath|corpse|hang(ed|ing)?)\w*\b/i,
  },
  {
    label: "substances",
    regex: /\b(cocaine|heroin|meth|weed|marijuana|drunk|alcohol|beer|vodka|whiskey|cigarette|smoking|vape)\w*\b/i,
  },
];

const FRIENDLY_BLOCK_MESSAGE =
  "Let's keep our story friendly and fun! Try a story about an adventure, " +
  "an animal, a friend, or a magical place \u2014 then we can make your movie. \uD83C\uDF1F";

function localCheck(text: string): ModerationResult {
  const categories: string[] = [];
  for (const { label, regex } of LOCAL_PATTERNS) {
    if (regex.test(text)) categories.push(label);
  }
  return {
    safe: categories.length === 0,
    categories,
    kidMessage: categories.length === 0 ? "" : FRIENDLY_BLOCK_MESSAGE,
  };
}

/**
 * Checks text against the always-on local filter AND (when an OpenAI key is
 * present) the OpenAI Moderation API. Fails safe: any tripped layer blocks.
 */
export async function moderateText(text: string): Promise<ModerationResult> {
  const local = localCheck(text);
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
    const item = result.results[0];
    if (item?.flagged) {
      const categories = Object.entries(item.categories || {})
        .filter(([, v]) => v)
        .map(([k]) => k);
      return { safe: false, categories, kidMessage: FRIENDLY_BLOCK_MESSAGE };
    }
    return { safe: true, categories: [], kidMessage: "" };
  } catch (err) {
    // If moderation can't run, fall back to the (passed) local result so the
    // app keeps working, but the local filter has already vetted the text.
    console.error("OpenAI moderation failed, using local filter only:", err);
    return local;
  }
}

// ------------------------- Video frame moderation -------------------------

const SCENE_BLOCK_MESSAGE =
  "We hid this scene to keep your movie kid-friendly. Try changing that " +
  "part of your story and make your movie again! \uD83D\uDEE1\uFE0F";

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

/**
 * Extracts a single frame from a video URL using the bundled ffmpeg binary.
 * The video is downloaded first (more reliable than ffmpeg's HTTP handling),
 * then a frame is grabbed from the local file. Returns JPEG bytes or null.
 */
async function extractVideoFrame(
  videoUrl: string,
  atSeconds = 1
): Promise<Buffer | null> {
  if (!ffmpegPath) return null;

  const inputPath = await downloadToTemp(videoUrl);
  if (!inputPath) return null;
  const outPath = join(tmpdir(), `frame-${randomUUID()}.jpg`);

  const ok = await new Promise<boolean>((resolve) => {
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
    proc.on("error", () => {
      clearTimeout(timer);
      resolve(false);
    });
    proc.on("close", (code) => {
      clearTimeout(timer);
      resolve(code === 0);
    });
  });

  unlink(inputPath).catch(() => {});

  if (!ok) {
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

/** Runs OpenAI image moderation on raw JPEG bytes. */
async function moderateImageBuffer(jpeg: Buffer): Promise<ModerationResult> {
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
    const item = result.results[0];
    if (item?.flagged) {
      const categories = Object.entries(item.categories || {})
        .filter(([, v]) => v)
        .map(([k]) => k);
      return { safe: false, categories, kidMessage: SCENE_BLOCK_MESSAGE };
    }
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

/**
 * Grabs a frame from a finished video and runs it through image moderation.
 * Returns safe=true if no frame could be extracted but no provider is set
 * (nothing to check against); otherwise fails safe on errors.
 */
export async function moderateVideoFrame(
  videoUrl: string
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
  return moderateImageBuffer(frame);
}

export { FRIENDLY_BLOCK_MESSAGE, SCENE_BLOCK_MESSAGE };
