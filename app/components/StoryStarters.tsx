"use client";

import { useState } from "react";
import type { Rating } from "@/lib/types";

const STARTERS: Record<Rating, string[]> = {
  kids: [
    "One morning I woke up and my pet could suddenly talk!",
    "I found a glowing door at the back of my closet.",
    "My whole class went on a field trip to the moon.",
    "A tiny dragon landed on my windowsill and looked hungry.",
    "I found a map to a secret treasure under the playground.",
    "Everything I drew came to life!",
  ],
  teens: [
    "The text was from a number that didn't exist yesterday.",
    "The power went out the same night strange lights filled the sky.",
    "The new student knew things about me no one could know.",
    "My grandfather's old watch could stop time for sixty seconds.",
    "When the storm cleared, the city outside wasn't mine anymore.",
    "I took the deal for the money. That was my first mistake.",
  ],
};

const PLAN_PROMPTS = [
  { icon: "🦸", q: "Who is your story about?" },
  { icon: "🗺️", q: "Where and when does it happen?" },
  { icon: "⚡", q: "What problem or surprise pops up?" },
  { icon: "🎉", q: "How does it end?" },
];

export default function StoryStarters({
  rating,
  hasStory,
  onPick,
}: {
  rating: Rating;
  hasStory: boolean;
  onPick: (text: string) => void;
}) {
  const [open, setOpen] = useState(!hasStory);

  return (
    <div className="mb-3 rounded-2xl bg-sky-50 ring-1 ring-sky-100">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center justify-between rounded-2xl px-4 py-2.5 text-left"
        aria-expanded={open}
      >
        <span className="text-sm font-bold text-sky-700">
          ✨ Need an idea? Story starters &amp; planner
        </span>
        <span className="text-sky-500">{open ? "▲" : "▼"}</span>
      </button>

      {open && (
        <div className="px-4 pb-4">
          <p className="mb-2 text-xs font-medium text-sky-600">
            Tap a starter to drop it into your story:
          </p>
          <div className="flex flex-col gap-2">
            {STARTERS[rating].map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => onPick(s)}
                className="rounded-xl bg-white px-3 py-2 text-left text-sm text-gray-700 shadow-sm ring-1 ring-sky-100 transition hover:bg-sky-100 active:scale-[0.99]"
              >
                {s}
              </button>
            ))}
          </div>

          <p className="mb-2 mt-4 text-xs font-medium text-sky-600">
            Stuck? Think about these as you write:
          </p>
          <ul className="grid grid-cols-2 gap-1.5">
            {PLAN_PROMPTS.map((p) => (
              <li
                key={p.q}
                className="flex items-center gap-1.5 rounded-lg bg-white/70 px-2 py-1.5 text-xs text-sky-800"
              >
                <span>{p.icon}</span>
                <span>{p.q}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
