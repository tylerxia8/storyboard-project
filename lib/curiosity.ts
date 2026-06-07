// Picks one warm, curious question that invites a student to ADD detail to a
// scene. Answering the question is really revising — but it feels like sharing.
// Deterministic per text so it doesn't flicker on every render.

const COLOR =
  /\b(red|orange|yellow|green|blue|purple|pink|black|white|brown|golden|silver|colorful|rainbow)\b/i;
const SOUND =
  /\b(heard|sound|loud|quiet|noise|music|sang|roared|whispered|shouted|bang|crash|buzz)\b/i;
const FEELING =
  /\b(happy|sad|scared|afraid|excited|angry|nervous|surprised|worried|proud|brave|joyful)\b/i;
const SMELL = /\b(smell|smelled|scent|sniff|fragrance|stinky|sweet)\b/i;

const DELIGHT = [
  "What tiny detail makes this scene special?",
  "What happens right after this moment?",
  "If you were standing here, what would you notice first?",
  "What is just outside the edge of the picture?",
];

export function curiousQuestion(text: string): string {
  const t = text || "";
  if (!COLOR.test(t)) return "What colors do you see in this scene?";
  if (!SOUND.test(t)) return "What sounds could you hear here?";
  if (!FEELING.test(t)) return "How is everyone feeling right now?";
  if (!SMELL.test(t)) return "What might this place smell like?";
  // Everything covered — pick a delight question, stable for this text.
  let hash = 0;
  for (let i = 0; i < t.length; i++) hash = (hash + t.charCodeAt(i)) % DELIGHT.length;
  return DELIGHT[hash];
}
