"use client";

import { useEffect, useRef, useState } from "react";
import type { Scene, StyleCharacter } from "@/lib/types";
import SpeakButton from "./SpeakButton";
import { genderForSpeaker } from "@/lib/speech";
import { playLines, type SpeechController } from "@/lib/tts";

export default function SceneCard({
  scene,
  index,
  characters = [],
}: {
  scene: Scene;
  index: number;
  characters?: StyleCharacter[];
}) {
  const isReady = scene.status === "succeeded";
  const isFailed = scene.status === "failed";
  const isWorking = scene.status === "starting" || scene.status === "processing";

  const lines = (scene.script ?? []).filter((l) => l.line.trim().length > 0);
  const [acting, setActing] = useState(false);
  const [canSpeak, setCanSpeak] = useState(false);
  const ctrlRef = useRef<SpeechController | null>(null);

  useEffect(() => {
    setCanSpeak(typeof window !== "undefined");
    return () => ctrlRef.current?.stop();
  }, []);

  function actItOut() {
    if (acting) {
      ctrlRef.current?.stop();
      setActing(false);
      return;
    }
    if (lines.length === 0) return;
    ctrlRef.current = playLines(
      lines.map((l) => ({
        text: l.line,
        speaker: l.speaker,
        gender: genderForSpeaker(l.speaker, characters),
      })),
      () => setActing(false)
    );
    setActing(true);
  }

  return (
    <div className="animate-pop rounded-3xl bg-white p-3 shadow-lg ring-2 ring-purple-100">
      <div className="mb-2 flex items-center gap-2 px-1">
        <span className="flex h-7 w-7 items-center justify-center rounded-full bg-purple-500 text-sm font-bold text-white">
          {index + 1}
        </span>
        <h3 className="text-lg font-semibold text-purple-700">{scene.title}</h3>
        <div className="ml-auto flex shrink-0 items-center gap-1.5">
          {canSpeak && lines.length > 0 && (
            <button
              type="button"
              onClick={actItOut}
              className="rounded-full bg-rose-500 px-2.5 py-1 text-sm font-semibold text-white shadow-sm transition hover:bg-rose-400 active:scale-95"
            >
              {acting ? "⏹ Stop" : "🎭 Act it out"}
            </button>
          )}
          {scene.narration && (
            <SpeakButton
              text={scene.narration}
              label=""
              className="rounded-full bg-purple-100 px-2.5 py-1 text-sm font-semibold text-purple-700 transition hover:bg-purple-200 active:scale-95"
            />
          )}
        </div>
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
              <>
                {scene.imageUrl && (
                  // Show the approved storyboard image as a poster while rendering.
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={scene.imageUrl}
                    alt={scene.title}
                    className="absolute inset-0 h-full w-full object-cover opacity-60"
                  />
                )}
                <div className="relative flex flex-col items-center gap-3 text-white">
                  <div className="flex gap-1.5">
                    <span className="h-3 w-3 animate-twinkle rounded-full bg-white" />
                    <span className="h-3 w-3 animate-twinkle rounded-full bg-white [animation-delay:0.2s]" />
                    <span className="h-3 w-3 animate-twinkle rounded-full bg-white [animation-delay:0.4s]" />
                  </div>
                  <p className="rounded-full bg-black/30 px-3 py-1 text-sm font-medium drop-shadow">
                    Bringing your scene to life...
                  </p>
                </div>
              </>
            ) : scene.safetyBlocked ? (
              <div className="flex flex-col items-center gap-2 text-white">
                <span className="text-3xl">🛡️</span>
                <p className="text-sm font-semibold drop-shadow">
                  We hid this scene to keep your movie appropriate for the
                  chosen audience. Try changing that part of your story!
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

      {/* Spoken script (the lines characters say in this scene) */}
      {lines.length > 0 && (
        <div className="mt-2 space-y-1 rounded-2xl bg-rose-50 p-3 ring-1 ring-rose-100">
          {lines.map((l, i) => (
            <p key={i} className="text-sm leading-snug text-rose-900">
              <span className="font-bold text-rose-600">
                {l.speaker || "Someone"}:
              </span>{" "}
              <span className="italic">“{l.line}”</span>
            </p>
          ))}
        </div>
      )}
    </div>
  );
}
