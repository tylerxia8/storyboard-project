import OpenAI from "openai";

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

export { FRIENDLY_BLOCK_MESSAGE };
