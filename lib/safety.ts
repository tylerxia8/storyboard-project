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

/** Strict G rules: suitable for general audiences of all ages. */
export const G_GUIDELINES = `CONTENT SAFETY RULES (must always follow):
- Keep everything strictly G-rated and suitable for general audiences of all ages.
- Absolutely NO nudity, sexual content, or romance beyond a friendly hug.
- NO profanity, swearing, slurs, or crude language.
- NO extreme or graphic violence, blood, gore, weapons used to harm, or death.
- NO horror, terror, or genuinely frightening imagery.
- NO drugs, alcohol, smoking, or gambling.
- NO hateful, discriminatory, or bullying content.
- Mild cartoon peril is okay only if it is clearly safe, silly, and resolves happily.
- Keep characters fully and modestly clothed at all times.
- The overall tone must be wholesome, kind, and fun, like a family animated film.`;

/** PG rules: parental guidance suggested; mild content okay. */
export const PG_GUIDELINES = `CONTENT SAFETY RULES (must always follow):
- Target a PG level (parental guidance suggested) suitable for older kids and up.
- Mild, stylized cartoon or fantasy action is allowed (e.g. light cartoon
  scuffles, a bug getting squished, a monster scared off, mild peril and stakes).
- NO intense or sustained violence, NO graphic gore, NO blood, NO torture, NO
  cruelty, and NO realistic depictions of injury or death.
- NO sexual content or nudity; only a brief, innocent moment of romance (like a
  quick hug or a peck on the cheek) is okay.
- Keep language clean; only very mild expressions, and NO profanity, slurs, or
  hate speech.
- NO drugs, alcohol, smoking, self-harm, or suicide.
- Keep characters appropriately and modestly clothed.
- The overall tone should be fun and adventurous, but still gentle and responsible.`;

export function getGuidelines(rating: Rating): string {
  return rating === "teens" ? PG_GUIDELINES : G_GUIDELINES;
}

// --------------------------- Local word filter ---------------------------

export type ModerationResult = {
  safe: boolean;
  /** Internal category labels that tripped, for logging. */
  categories: string[];
  /** A friendly, age-appropriate message to show if blocked. */
  kidMessage: string;
  /** The specific words/phrases that tripped the filter, to highlight for kids. */
  flaggedTerms?: string[];
  /** Plain, kid-friendly explanations of WHAT to change (one per problem kind). */
  reasons?: string[];
  /** Exact sentence(s) or lines from the checked text the student should edit. */
  snippets?: string[];
};

// ----------------------- Why-it-was-flagged reasons -----------------------

// A clear, action-oriented sentence per problem "kind" so a student knows
// exactly what to fix. Kept positive and concrete.
const REASON_BY_KIND: Record<string, string> = {
  language: "Swap any bad words or name-calling for kinder ones.",
  hate: "Take out mean or hurtful words aimed at a person or group.",
  violence:
    "Make the fighting or getting-hurt parts gentler \u2014 no weapons, blood, or real harm.",
  scary: "Tone down the really scary or creepy parts.",
  sexual: "Keep romance friendly \u2014 no grown-up or body content.",
  self_harm: "Remove anything about hurting yourself.",
  substances: "Take out drugs, alcohol, smoking, or vaping.",
  danger: "Take out the dangerous or against-the-rules activity.",
};

// Maps both our local filter labels AND OpenAI moderation categories onto the
// shared "kinds" above, so we can explain either source the same friendly way.
const KIND_BY_CATEGORY: Record<string, string> = {
  // Local filter labels
  profanity_strong: "language",
  profanity_mild: "language",
  slur: "hate",
  sexual: "sexual",
  self_harm: "self_harm",
  violence_graphic: "violence",
  violence_strong: "violence",
  substances_hard: "substances",
  substances_soft: "substances",
  // OpenAI moderation categories
  harassment: "hate",
  "harassment/threatening": "hate",
  hate: "hate",
  "hate/threatening": "hate",
  "sexual/minors": "sexual",
  "self-harm": "self_harm",
  "self-harm/intent": "self_harm",
  "self-harm/instructions": "self_harm",
  violence: "violence",
  "violence/graphic": "violence",
  illicit: "danger",
  "illicit/violent": "violence",
};

/**
 * Turns tripped category labels (local labels OR OpenAI categories, which may
 * be suffixed with a score like "violence:0.82") into a de-duplicated list of
 * plain, kid-friendly things to change.
 */
export function friendlyReasons(categories: string[]): string[] {
  const kinds: string[] = [];
  for (const raw of categories) {
    const key = raw.split(":")[0].trim();
    const kind = KIND_BY_CATEGORY[key];
    if (kind && !kinds.includes(kind)) kinds.push(kind);
  }
  return kinds.map((k) => REASON_BY_KIND[k]).filter(Boolean);
}

/** Splits prose into sentence-ish chunks (handles newlines for storyboard text). */
function splitSentences(text: string): string[] {
  return (
    text
      .split(/\n+/)
      .flatMap((block) =>
        block.match(/[^.!?]+[.!?]*/g)?.map((s) => s.trim()) ?? [block.trim()]
      )
      .filter(Boolean) ?? []
  );
}

/** Sentences containing words the rating actually blocks (never PG-allowed words). */
function findProblemSnippetsLocal(text: string, rating: Rating): string[] {
  const sentences = splitSentences(text);
  if (sentences.length === 0) return text.trim() ? [text.trim()] : [];

  const block = LOCAL_BLOCK[rating];
  const terms = findFlaggedTerms(text, block);
  const pick = (list: string[]) =>
    sentences.filter((s) =>
      list.some((t) => s.toLowerCase().includes(t.toLowerCase()))
    );

  let hits = pick(terms);
  if (hits.length === 0) {
    hits = sentences.filter((s) => !localCheck(s, rating).safe);
  }
  return [...new Set(hits.map((s) => s.trim()).filter(Boolean))].slice(0, 6);
}

/**
 * Re-runs OpenAI moderation on each sentence so we highlight only the line(s)
 * that actually fail PG/G — not innocent lines that happen to contain words
 * like "fight" or "love" that PG allows.
 */
async function findProblemSnippetsOpenAi(
  text: string,
  rating: Rating
): Promise<string[]> {
  const sentences = splitSentences(text);
  if (sentences.length === 0) return text.trim() ? [text.trim()] : [];
  if (!OPENAI_API_KEY) return findProblemSnippetsLocal(text, rating);

  try {
    const client = new OpenAI({ apiKey: OPENAI_API_KEY });
    const result = await client.moderations.create({
      model: "omni-moderation-latest",
      input: sentences.length === 1 ? sentences[0] : sentences,
    });
    const items = result.results;
    const hits: string[] = [];
    // Track the highest-scoring sentence when the whole story fails but no
    // single line crosses the threshold on its own.
    let topIdx = -1;
    let topScore = 0;

    for (let i = 0; i < sentences.length; i++) {
      const item = items[i] as unknown as ModerationItem;
      if (!item) continue;
      const { blocked } = evaluateOpenAi(item, rating);
      if (blocked) {
        hits.push(sentences[i]);
        continue;
      }
      const policy = OPENAI_POLICY[rating];
      if (policy.mode === "threshold") {
        for (const [, score] of Object.entries(item.category_scores || {})) {
          if (score > topScore) {
            topScore = score;
            topIdx = i;
          }
        }
      }
    }

    if (hits.length > 0) {
      return [...new Set(hits.map((s) => s.trim()).filter(Boolean))].slice(0, 6);
    }
    if (topIdx >= 0) return [sentences[topIdx].trim()];
  } catch (err) {
    console.error("Per-sentence moderation failed:", err);
  }
  return findProblemSnippetsLocal(text, rating);
}

function withSnippetsLocal(
  result: Omit<ModerationResult, "snippets">,
  text: string,
  rating: Rating
): ModerationResult {
  if (result.safe) return { ...result, snippets: [] };
  return {
    ...result,
    snippets: findProblemSnippetsLocal(text, rating),
  };
}

async function withSnippetsOpenAi(
  result: Omit<ModerationResult, "snippets">,
  text: string,
  rating: Rating
): Promise<ModerationResult> {
  if (result.safe) return { ...result, snippets: [] };
  const snippets = await findProblemSnippetsOpenAi(text, rating);
  return { ...result, snippets };
}
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
  // PG blocks everything G does EXCEPT very mild language; mild cartoon action
  // words (e.g. a single "fight") are allowed by the AI guidelines.
  teens: new Set([
    "profanity_strong",
    "slur",
    "sexual",
    "self_harm",
    "violence_graphic",
    "substances_hard",
    "substances_soft",
  ]),
};

// --------------------------- OpenAI policy ---------------------------

type OpenAiPolicy =
  | { mode: "flagged" }
  | { mode: "threshold"; thresholds: Record<string, number>; fallback: number };

const OPENAI_POLICY: Record<Rating, OpenAiPolicy> = {
  // Strictest: block whenever the model flags anything at all.
  kids: { mode: "flagged" },
  // PG: allow only MILD stylized action; keep everything else strict.
  teens: {
    mode: "threshold",
    fallback: 0.6,
    thresholds: {
      sexual: 0.4,
      "sexual/minors": 0.1,
      harassment: 0.6,
      "harassment/threatening": 0.5,
      hate: 0.4,
      "hate/threatening": 0.35,
      illicit: 0.6,
      "illicit/violent": 0.6,
      "self-harm": 0.35,
      "self-harm/intent": 0.35,
      "self-harm/instructions": 0.3,
      violence: 0.7,
      "violence/graphic": 0.45,
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

/** Collects the actual words/phrases in the text that match the filter. */
function findFlaggedTerms(text: string, labels?: Set<string>): string[] {
  const terms = new Set<string>();
  for (const { label, regex } of LOCAL_PATTERNS) {
    if (labels && !labels.has(label)) continue;
    const g = new RegExp(
      regex.source,
      regex.flags.includes("g") ? regex.flags : regex.flags + "g"
    );
    let m: RegExpExecArray | null;
    while ((m = g.exec(text)) !== null) {
      if (m[0]) terms.add(m[0]);
      if (m.index === g.lastIndex) g.lastIndex++; // guard against zero-width
    }
  }
  return [...terms];
}

function localCheck(text: string, rating: Rating): ModerationResult {
  const block = LOCAL_BLOCK[rating];
  const categories: string[] = [];
  for (const { label, regex } of LOCAL_PATTERNS) {
    if (block.has(label) && regex.test(text)) categories.push(label);
  }
  return withSnippetsLocal(
    {
      safe: categories.length === 0,
      categories,
      kidMessage: categories.length === 0 ? "" : FRIENDLY_BLOCK_MESSAGE,
      flaggedTerms: categories.length === 0 ? [] : findFlaggedTerms(text, block),
      reasons: categories.length === 0 ? [] : friendlyReasons(categories),
    },
    text,
    rating
  );
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
    if (blocked)
      return withSnippetsOpenAi(
        {
          safe: false,
          categories,
          kidMessage: FRIENDLY_BLOCK_MESSAGE,
          // Only words this rating blocks — PG must not flag allowed words like "fight".
          flaggedTerms: findFlaggedTerms(text, LOCAL_BLOCK[rating]),
          reasons: friendlyReasons(categories),
        },
        text,
        rating
      );
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
