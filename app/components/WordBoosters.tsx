"use client";

// Plain/overused words → stronger choices. Tapping a suggestion swaps the first
// occurrence in the story, so revising feels like a quick, rewarding game.
const BOOSTERS: Record<string, string[]> = {
  good: ["wonderful", "fantastic", "terrific", "amazing"],
  bad: ["terrible", "awful", "dreadful", "nasty"],
  big: ["enormous", "gigantic", "massive", "towering"],
  little: ["tiny", "teeny", "miniature"],
  small: ["tiny", "teeny", "miniature"],
  nice: ["kind", "lovely", "delightful", "friendly"],
  happy: ["joyful", "thrilled", "delighted", "cheerful"],
  sad: ["gloomy", "miserable", "heartbroken", "glum"],
  scared: ["terrified", "frightened", "petrified", "spooked"],
  fun: ["exciting", "thrilling", "delightful"],
  pretty: ["beautiful", "gorgeous", "lovely", "stunning"],
  said: ["exclaimed", "whispered", "shouted", "replied"],
  went: ["raced", "strolled", "dashed", "wandered"],
  got: ["grabbed", "received", "found", "snatched"],
  looked: ["stared", "glanced", "peeked", "gazed"],
  ran: ["dashed", "sprinted", "raced", "bolted"],
  walked: ["strolled", "marched", "wandered", "tiptoed"],
};

// Filler words that usually make writing weaker; offer to delete them.
const FILLERS = ["very", "really", "just", "so"];

function findFirst(text: string, word: string) {
  const re = new RegExp(`\\b${word}\\b`, "i");
  return re.exec(text);
}

function matchCase(original: string, replacement: string) {
  return /^[A-Z]/.test(original)
    ? replacement.charAt(0).toUpperCase() + replacement.slice(1)
    : replacement;
}

export default function WordBoosters({
  story,
  onApply,
}: {
  story: string;
  onApply: (next: string) => void;
}) {
  const boosters = Object.keys(BOOSTERS).filter((w) => findFirst(story, w));
  const fillers = FILLERS.filter((w) => findFirst(story, w));

  if (boosters.length === 0 && fillers.length === 0) return null;

  function swap(word: string, replacement: string) {
    const m = findFirst(story, word);
    if (!m) return;
    const cased = matchCase(m[0], replacement);
    onApply(story.slice(0, m.index) + cased + story.slice(m.index + m[0].length));
  }

  function remove(word: string) {
    const m = findFirst(story, word);
    if (!m) return;
    // Drop the word plus one trailing space (or a leading space if at the end).
    let start = m.index;
    let end = m.index + m[0].length;
    if (story[end] === " ") end += 1;
    else if (start > 0 && story[start - 1] === " ") start -= 1;
    onApply(story.slice(0, start) + story.slice(end));
  }

  return (
    <div className="rounded-3xl bg-white p-5 shadow-lg ring-2 ring-pink-100">
      <h2 className="mb-1 text-xl font-semibold text-pink-600">
        ✨ Word Boosters
      </h2>
      <p className="mb-3 text-sm text-gray-500">
        Tap a stronger word to swap it into your story!
      </p>

      <div className="space-y-3">
        {boosters.slice(0, 6).map((word) => (
          <div key={word} className="flex flex-wrap items-center gap-2">
            <span className="rounded-full bg-gray-100 px-2.5 py-1 text-sm font-semibold text-gray-500 line-through">
              {word}
            </span>
            <span className="text-gray-400">→</span>
            {BOOSTERS[word].map((alt) => (
              <button
                key={alt}
                type="button"
                onClick={() => swap(word, alt)}
                className="rounded-full bg-gradient-to-r from-pink-400 to-purple-400 px-3 py-1 text-sm font-semibold text-white shadow-sm transition hover:from-pink-300 hover:to-purple-300 active:scale-95"
              >
                {alt}
              </button>
            ))}
          </div>
        ))}
      </div>

      {fillers.length > 0 && (
        <div className="mt-4 border-t border-pink-100 pt-3">
          <p className="mb-2 text-sm text-gray-500">
            Filler words can sneak in. Try removing one:
          </p>
          <div className="flex flex-wrap gap-2">
            {fillers.map((word) => (
              <button
                key={word}
                type="button"
                onClick={() => remove(word)}
                className="rounded-full bg-rose-100 px-3 py-1 text-sm font-semibold text-rose-700 transition hover:bg-rose-200 active:scale-95"
              >
                remove &quot;{word}&quot; ✕
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
