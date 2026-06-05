"use client";

import type { StoryboardScene } from "@/lib/types";

export default function StoryboardCard({
  scene,
  index,
  redrawing,
  onChange,
  onRedraw,
}: {
  scene: StoryboardScene;
  index: number;
  redrawing: boolean;
  onChange: (patch: Partial<StoryboardScene>) => void;
  onRedraw: () => void;
}) {
  return (
    <div className="animate-pop rounded-3xl bg-white p-3 shadow-lg ring-2 ring-purple-100">
      <div className="mb-2 flex items-center gap-2 px-1">
        <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-purple-500 text-sm font-bold text-white">
          {index + 1}
        </span>
        <input
          value={scene.title}
          onChange={(e) => onChange({ title: e.target.value })}
          className="w-full rounded-lg bg-transparent px-1 text-lg font-semibold text-purple-700 outline-none focus:bg-purple-50"
          aria-label={`Scene ${index + 1} title`}
        />
      </div>

      {/* Image preview */}
      <div className="relative aspect-video w-full overflow-hidden rounded-2xl">
        {scene.imageUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={scene.imageUrl}
            alt={scene.title}
            className="h-full w-full object-cover"
          />
        ) : (
          <div
            className={`flex h-full w-full items-center justify-center bg-gradient-to-br ${scene.palette} p-4 text-center`}
          >
            {scene.imageBlocked ? (
              <div className="flex flex-col items-center gap-1 text-white">
                <span className="text-3xl">🛡️</span>
                <p className="text-sm font-semibold drop-shadow">
                  We hid this picture. Try changing the description.
                </p>
              </div>
            ) : (
              <p className="animate-bob text-base font-semibold leading-snug text-white drop-shadow-md">
                {scene.description}
              </p>
            )}
          </div>
        )}

        {redrawing && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/40">
            <div className="flex items-center gap-1.5 text-white">
              <span className="h-3 w-3 animate-twinkle rounded-full bg-white" />
              <span className="h-3 w-3 animate-twinkle rounded-full bg-white [animation-delay:0.2s]" />
              <span className="h-3 w-3 animate-twinkle rounded-full bg-white [animation-delay:0.4s]" />
              <span className="ml-1 text-sm font-medium drop-shadow">
                Drawing...
              </span>
            </div>
          </div>
        )}
      </div>

      {/* Editable description */}
      <textarea
        value={scene.description}
        onChange={(e) => onChange({ description: e.target.value })}
        rows={3}
        placeholder="Describe what happens in this scene..."
        className="mt-2 w-full resize-none rounded-xl border-2 border-purple-100 bg-purple-50/40 p-2 text-sm leading-relaxed text-gray-800 outline-none transition focus:border-purple-300 focus:bg-white"
      />

      <button
        onClick={onRedraw}
        disabled={redrawing || !scene.description.trim()}
        className="mt-2 w-full rounded-xl bg-amber-400 px-4 py-2 text-sm font-bold text-amber-950 shadow transition hover:bg-amber-300 active:scale-95 disabled:cursor-not-allowed disabled:opacity-50"
      >
        {redrawing ? "Drawing..." : "🔄 Redraw this scene"}
      </button>
    </div>
  );
}
