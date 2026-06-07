"use client";

import { scoreStory } from "@/lib/storyScore";

export default function GlowUpMeter({ story }: { story: string }) {
  const { score, level, nextTip } = scoreStory(story);

  return (
    <div className="rounded-3xl bg-white p-5 shadow-lg ring-2 ring-fuchsia-100">
      <div className="mb-2 flex items-center justify-between">
        <h2 className="text-xl font-semibold text-fuchsia-600">
          ✨ Glow-Up Meter
        </h2>
        <span className="rounded-full bg-fuchsia-100 px-3 py-1 text-sm font-bold text-fuchsia-700">
          {level.emoji} {level.name}
        </span>
      </div>

      <div className="relative h-5 w-full overflow-hidden rounded-full bg-fuchsia-50 ring-1 ring-fuchsia-100">
        <div
          className="h-full rounded-full bg-gradient-to-r from-fuchsia-400 via-purple-400 to-pink-400 transition-all duration-700 ease-out"
          style={{ width: `${Math.max(score, 4)}%` }}
        />
        <span className="absolute inset-0 flex items-center justify-center text-xs font-bold text-fuchsia-900/80">
          {score} / 100
        </span>
      </div>

      {score >= 100 ? (
        <p className="mt-3 rounded-2xl bg-gradient-to-r from-fuchsia-100 to-pink-100 p-3 text-center text-sm font-semibold text-fuchsia-700">
          🌟 Your story is sparkling! It&apos;s ready to shine on screen.
        </p>
      ) : (
        nextTip && (
          <p className="mt-2 text-sm text-fuchsia-600">
            <span className="font-semibold">Next glow-up:</span> {nextTip}
          </p>
        )
      )}
      <p className="mt-1 text-xs text-gray-400">
        Edit your story and watch the meter grow!
      </p>
    </div>
  );
}
