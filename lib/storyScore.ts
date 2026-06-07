// A friendly, heuristic "quality" score for a story (0-100). It powers the
// Glow-Up Meter and the "you made it better!" celebration. Pure + client-safe.

const DESCRIBING =
  /\b(red|orange|yellow|green|blue|purple|pink|black|white|brown|golden|silver|tiny|small|huge|giant|enormous|tall|short|long|shiny|sparkly|bright|dark|soft|fluffy|cold|hot|warm|loud|quiet|fast|slow|beautiful|scary|magical|gentle|fierce|smooth|rough)\b/gi;
const FEELINGS =
  /\b(happy|sad|scared|afraid|excited|angry|mad|nervous|surprised|worried|proud|brave|lonely|curious|joyful|shy|grumpy|cheerful|frightened|delighted)\b/gi;
const SETTING =
  /\b(park|school|home|house|forest|jungle|ocean|sea|beach|space|castle|city|town|village|farm|mountain|river|lake|cave|garden|room|kitchen|playground|zoo|island|moon|woods|desert|night|morning|day)\b/i;
const SETTING_PHRASE = /\b(in|at|on|inside|near)\s+(the|a|an|my|his|her|their)\b/i;

export type ScoreLevel = { name: string; emoji: string };
export type StoryScore = {
  score: number;
  level: ScoreLevel;
  /** The single best next thing to do to raise the score, or null if maxed. */
  nextTip: string | null;
};

function levelFor(score: number): ScoreLevel {
  if (score >= 90) return { name: "Story Master", emoji: "👑" };
  if (score >= 70) return { name: "Story Pro", emoji: "🏆" };
  if (score >= 40) return { name: "Rising Star", emoji: "⭐" };
  return { name: "Story Sprout", emoji: "🌱" };
}

export function scoreStory(text: string): StoryScore {
  const t = text.trim();
  const words = t ? t.split(/\s+/).length : 0;
  const sentences = (t.match(/[.!?]+/g) || []).length;
  const describing = (t.match(DESCRIBING) || []).length;
  const feelings = (t.match(FEELINGS) || []).length;
  const hasSetting = SETTING.test(t) || SETTING_PHRASE.test(t);
  const hasDialogue = /["“”].+["“”]/.test(t);

  const cats = [
    {
      pts: Math.min(30, Math.floor(words / 2)),
      max: 30,
      tip: "Keep going — add more to your story!",
    },
    {
      pts: Math.min(25, describing * 5),
      max: 25,
      tip: "Sprinkle in describing words (colors, sizes, textures).",
    },
    {
      pts: Math.min(15, feelings * 8),
      max: 15,
      tip: "Tell us how a character feels inside.",
    },
    {
      pts: hasSetting ? 10 : 0,
      max: 10,
      tip: "Describe where and when your story happens.",
    },
    {
      pts: sentences >= 4 ? 10 : sentences >= 2 ? 5 : 0,
      max: 10,
      tip: "Add a few more sentences to grow your story.",
    },
    {
      pts: hasDialogue ? 10 : 0,
      max: 10,
      tip: "Add something a character says out loud.",
    },
  ];

  const score = Math.min(
    100,
    cats.reduce((sum, c) => sum + c.pts, 0)
  );
  const gaps = cats
    .filter((c) => c.pts < c.max)
    .sort((a, b) => b.max - b.pts - (a.max - a.pts));
  const nextTip = gaps.length > 0 ? gaps[0].tip : null;

  return { score, level: levelFor(score), nextTip };
}
