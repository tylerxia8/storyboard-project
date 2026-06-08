"use client";

import { useMemo, useState } from "react";

// A few rotating, idea-sparking prompts so the blank panel always feels like an
// invitation to keep the story going.
const PROMPTS = [
  "What happens next? ✨",
  "Add a surprise twist! 😲",
  "What does someone say next? 💬",
  "Introduce a new character! 🦊",
  "Show how the story ends! 🌟",
  "Where do they go next? 🗺️",
];

// An always-present, friendly "blank panel" that invites students to keep
// building their story. Typing here and pressing Add creates (and draws) a new
// scene, then the panel resets for the next idea.
export default function NextScenePanel({
  index,
  onAdd,
}: {
  /** Position this scene would take (for the number badge). */
  index: number;
  onAdd: (description: string) => void;
}) {
  const [text, setText] = useState("");
  // Pick a stable prompt per mount so it doesn't flicker on each keystroke.
  const prompt = useMemo(
    () => PROMPTS[Math.floor(Math.random() * PROMPTS.length)],
    []
  );

  function submit() {
    onAdd(text);
    setText("");
  }

  const hasText = text.trim().length > 0;

  return (
    <div className="animate-pop rounded-3xl border-2 border-dashed border-purple-300 bg-purple-50/40 p-3 transition hover:border-purple-400 hover:bg-purple-50">
      <div className="mb-2 flex items-center gap-2 px-1">
        <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-purple-200 text-sm font-bold text-purple-600">
          {index + 1}
        </span>
        <p className="text-lg font-semibold text-purple-600">{prompt}</p>
      </div>

      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => {
          // Enter adds the scene; Shift+Enter makes a new line.
          if (e.key === "Enter" && !e.shiftKey) {
            e.preventDefault();
            if (hasText) submit();
          }
        }}
        rows={3}
        placeholder="Type what happens in the next scene... then we'll draw it for you! ✏️"
        className="w-full resize-none rounded-xl border-2 border-purple-100 bg-white/80 p-2 text-sm leading-relaxed text-gray-800 outline-none transition focus:border-purple-300 focus:bg-white"
      />

      <button
        type="button"
        onClick={submit}
        className="mt-2 w-full rounded-xl bg-gradient-to-r from-purple-500 to-pink-500 px-4 py-2 text-sm font-bold text-white shadow transition hover:from-purple-400 hover:to-pink-400 active:scale-95"
      >
        {hasText ? "✨ Add & draw this scene" : "➕ Add a blank scene"}
      </button>
    </div>
  );
}
