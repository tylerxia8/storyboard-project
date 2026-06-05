"use client";

const FEELINGS =
  /\b(happy|sad|scared|afraid|excited|angry|mad|nervous|surprised|worried|proud|brave|lonely|curious|joyful|shy|grumpy|cheerful|frightened|delighted)\b/i;
const SETTING =
  /\b(park|school|home|house|forest|jungle|ocean|sea|beach|space|castle|city|town|village|farm|mountain|river|lake|cave|garden|room|kitchen|playground|zoo|island|moon|woods|desert|night|morning|day)\b/i;
const SETTING_PHRASE = /\b(in|at|on|inside|near)\s+(the|a|an|my|his|her|their)\b/i;
const CHARACTER =
  /\b(he|she|they|i|we|my|named|boy|girl|dog|cat|man|woman|kid|child|hero|princess|prince|king|queen|dragon|robot|monster|wizard|fairy|friend|mom|dad|teacher)\b/i;
const DESCRIBING =
  /\b(red|orange|yellow|green|blue|purple|pink|black|white|brown|golden|silver|tiny|small|huge|giant|enormous|tall|short|long|shiny|sparkly|bright|dark|soft|fluffy|cold|hot|warm|loud|quiet|fast|slow|beautiful|scary|magical|gentle|fierce|smooth|rough)\b/i;
const PROBLEM =
  /\b(but|suddenly|uh-oh|oh no|problem|trouble|lost|couldn't|can't|cannot|broke|broken|scared|afraid|chase|chased|ran|help|danger|dangerous|missing|stuck|fell|crashed|fight|escape)\b/i;
const ENDING =
  /\b(finally|at last|in the end|happily|the end|ever after|home safe|safe again|saved the day|learned)\b/i;

function check(story: string) {
  const text = story.trim();
  const words = text ? text.split(/\s+/).length : 0;
  const sentences = (text.match(/[.!?]+/g) || []).length;

  return [
    { label: "A good start (at least 15 words)", done: words >= 15 },
    { label: "Tells who the story is about", done: CHARACTER.test(text) },
    {
      label: "Has a setting (where/when it happens)",
      done: SETTING.test(text) || SETTING_PHRASE.test(text),
    },
    { label: "Shows a feeling", done: FEELINGS.test(text) },
    { label: "Uses describing words", done: DESCRIBING.test(text) },
    { label: "Has a problem or something exciting", done: PROBLEM.test(text) },
    {
      label: "Has an ending",
      done: ENDING.test(text) || (sentences >= 4 && words >= 45),
    },
  ];
}

export default function WritingChecklist({ story }: { story: string }) {
  const items = check(story);
  const done = items.filter((i) => i.done).length;
  const allDone = done === items.length;

  return (
    <div className="rounded-3xl bg-white p-5 shadow-lg ring-2 ring-emerald-100">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-xl font-semibold text-emerald-600">
          ✅ Story Checklist
        </h2>
        <span className="rounded-full bg-emerald-100 px-3 py-1 text-sm font-medium text-emerald-700">
          {done}/{items.length}
        </span>
      </div>

      <ul className="space-y-1.5">
        {items.map((item) => (
          <li
            key={item.label}
            className={`flex items-center gap-2 rounded-xl px-2 py-1.5 text-sm transition ${
              item.done ? "bg-emerald-50 text-emerald-800" : "text-gray-500"
            }`}
          >
            <span className="text-base">{item.done ? "✅" : "⬜"}</span>
            <span className={item.done ? "font-medium" : ""}>{item.label}</span>
          </li>
        ))}
      </ul>

      {allDone && (
        <p className="mt-3 rounded-2xl bg-gradient-to-r from-emerald-100 to-teal-100 p-3 text-center text-sm font-semibold text-emerald-700">
          🌟 Amazing! Your story has everything. Time to make your storyboard!
        </p>
      )}
    </div>
  );
}
