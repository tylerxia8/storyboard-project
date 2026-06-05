"use client";

import type { Scene } from "@/lib/types";

export default function SceneCard({ scene, index }: { scene: Scene; index: number }) {
  const isReady = scene.status === "succeeded";
  const isFailed = scene.status === "failed";
  const isWorking = scene.status === "starting" || scene.status === "processing";

  return (
    <div className="animate-pop rounded-3xl bg-white p-3 shadow-lg ring-2 ring-purple-100">
      <div className="mb-2 flex items-center gap-2 px-1">
        <span className="flex h-7 w-7 items-center justify-center rounded-full bg-purple-500 text-sm font-bold text-white">
          {index + 1}
        </span>
        <h3 className="text-lg font-semibold text-purple-700">{scene.title}</h3>
      </div>

      <div className="relative aspect-video w-full overflow-hidden rounded-2xl">
        {/* Real video when available */}
        {isReady && scene.videoUrl ? (
          <video
            className="h-full w-full object-cover"
            src={scene.videoUrl}
            controls
            autoPlay
            loop
            muted
            playsInline
          />
        ) : (
          // Animated placeholder scene (used in practice mode or while loading)
          <div
            className={`animate-scene flex h-full w-full items-center justify-center bg-gradient-to-br ${scene.palette} p-4 text-center`}
          >
            {isWorking ? (
              <div className="flex flex-col items-center gap-3 text-white">
                <div className="flex gap-1.5">
                  <span className="h-3 w-3 animate-twinkle rounded-full bg-white" />
                  <span className="h-3 w-3 animate-twinkle rounded-full bg-white [animation-delay:0.2s]" />
                  <span className="h-3 w-3 animate-twinkle rounded-full bg-white [animation-delay:0.4s]" />
                </div>
                <p className="text-sm font-medium drop-shadow">
                  Drawing your scene...
                </p>
              </div>
            ) : isFailed ? (
              <p className="text-sm font-semibold text-white drop-shadow">
                This scene needs another try!
              </p>
            ) : (
              <p className="animate-bob text-base font-semibold leading-snug text-white drop-shadow-md">
                {scene.narration}
              </p>
            )}
          </div>
        )}
      </div>

      {/* Narration caption below real videos */}
      {isReady && scene.videoUrl && (
        <p className="px-2 pt-2 text-sm text-gray-600">{scene.narration}</p>
      )}
    </div>
  );
}
