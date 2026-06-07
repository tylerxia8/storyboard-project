// Picks a warm, curious question that invites a student to ADD rich detail to a
// scene. Answering the question is really revising — but it feels like sharing.
// Used as a fallback when the AI hasn't generated a scene-specific question
// (e.g. Practice Mode). Deterministic per text so it doesn't flicker.

const HAS = {
  color:
    /\b(red|orange|yellow|green|blue|purple|pink|black|white|brown|golden|silver|colorful|rainbow)\b/i,
  sound:
    /\b(heard|sound|loud|quiet|noise|music|sang|roared|whispered|shouted|bang|crash|buzz|rustle|echo)\b/i,
  feeling:
    /\b(happy|sad|scared|afraid|excited|angry|nervous|surprised|worried|proud|brave|joyful|lonely|curious)\b/i,
  smell: /\b(smell|smelled|scent|sniff|fragrance|stinky|sweet|fresh)\b/i,
  touch: /\b(soft|rough|cold|hot|warm|wet|smooth|fluffy|sharp|sticky|fuzzy)\b/i,
  weather: /\b(sun|sunny|rain|rainy|snow|wind|windy|storm|cloud|fog|night|dark)\b/i,
};

// Pools of richer, craft-focused questions, grouped by what they push for.
const POOLS: { key: keyof typeof HAS | "always"; questions: string[] }[] = [
  {
    key: "feeling",
    questions: [
      "How does your main character feel in this moment, and how can we tell?",
      "What is your character secretly hoping will happen here?",
      "What's going through your character's mind right now?",
    ],
  },
  {
    key: "sound",
    questions: [
      "What sounds fill this scene — loud, quiet, or somewhere in between?",
      "If you closed your eyes here, what would you hear first?",
      "Is anyone talking? What might they say out loud?",
    ],
  },
  {
    key: "touch",
    questions: [
      "If your character reached out, what would things feel like to touch?",
      "What does the air or ground feel like in this place?",
    ],
  },
  {
    key: "smell",
    questions: [
      "What might this place smell like?",
      "Is there a smell that tells us where we are?",
    ],
  },
  {
    key: "weather",
    questions: [
      "What's the weather or time of day, and how does it change the mood?",
      "Is it bright, gloomy, or stormy here? Show us!",
    ],
  },
  {
    key: "color",
    questions: [
      "Which colors stand out the most in this scene, and why?",
      "What's the most colorful thing your character can see?",
    ],
  },
  {
    key: "always",
    questions: [
      "What is your character DOING — can you use a stronger action word?",
      "What is the most important detail in this scene that we shouldn't miss?",
      "What just happened right before this, and what happens next?",
      "What is one surprising little detail hiding in the background?",
      "Why does this moment matter to your character?",
      "What is your character worried might go wrong here?",
    ],
  },
];

function pick(arr: string[], seed: number): string {
  return arr[seed % arr.length];
}

export function curiousQuestion(text: string): string {
  const t = text || "";
  let seed = 0;
  for (let i = 0; i < t.length; i++) seed = (seed + t.charCodeAt(i)) % 100000;

  // Prefer a sense/feeling the scene is MISSING, so each answer adds something
  // new — but vary which one so it never feels like the same rote prompt.
  const missing = POOLS.filter(
    (p) => p.key !== "always" && !HAS[p.key as keyof typeof HAS].test(t)
  );
  const chosen =
    missing.length > 0
      ? missing[seed % missing.length]
      : POOLS[POOLS.length - 1]; // "always" pool when senses are covered

  return pick(chosen.questions, seed);
}
