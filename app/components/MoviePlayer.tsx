"use client";

import { useEffect, useRef, useState } from "react";
import type { Scene, StyleCharacter } from "@/lib/types";
import { genderForSpeaker } from "@/lib/speech";
import { playLines, voiceOverrideFor, type SpeechController } from "@/lib/tts";

// Minimum time to linger on a scene even if there are no spoken lines, so the
// movie doesn't flash by. Scenes with dialogue stay until the lines finish.
const MIN_DWELL_MS = 4500;

// A full-screen, hands-free player: it plays each scene's clip while the
// characters speak their lines, then auto-advances to the next scene.
export default function MoviePlayer({
  title,
  scenes,
  characters = [],
  voiceOverrides,
  onClose,
}: {
  title: string;
  scenes: Scene[];
  characters?: StyleCharacter[];
  /** name (lowercased) -> chosen voice id for character voices. */
  voiceOverrides?: Record<string, string>;
  onClose: () => void;
}) {
  const [index, setIndex] = useState(0);
  const [playing, setPlaying] = useState(true);
  const videoRef = useRef<HTMLVideoElement>(null);
  const ctrlRef = useRef<SpeechController | null>(null);

  const scene = scenes[index];
  const isLast = index >= scenes.length - 1;
  const lines = (scene?.script ?? []).filter((l) => l.line.trim().length > 0);

  // Drive playback for the current scene whenever it changes (or we resume).
  useEffect(() => {
    if (!playing || !scene) return;

    const v = videoRef.current;
    if (v) {
      try {
        v.currentTime = 0;
        const p = v.play();
        if (p) p.catch(() => {});
      } catch {
        // autoplay may be blocked; the poster still shows
      }
    }

    let timer: ReturnType<typeof setTimeout>;
    const start = Date.now();
    const advance = () => {
      if (index < scenes.length - 1) setIndex(index + 1);
      else setPlaying(false);
    };
    const finish = () => {
      const wait = Math.max(0, MIN_DWELL_MS - (Date.now() - start));
      timer = setTimeout(advance, wait);
    };

    if (lines.length > 0) {
      ctrlRef.current = playLines(
        lines.map((l) => ({
          text: l.line,
          speaker: l.speaker,
          gender: genderForSpeaker(l.speaker, characters),
          voice: voiceOverrideFor(l.speaker, voiceOverrides),
        })),
        finish
      );
    } else {
      finish();
    }

    return () => {
      clearTimeout(timer);
      ctrlRef.current?.stop();
      videoRef.current?.pause();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [playing, index, scenes.length]);

  // Esc closes the player.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  function togglePlay() {
    if (!playing && isLast) {
      // Movie finished — replay from the top.
      setIndex(0);
      setPlaying(true);
      return;
    }
    setPlaying((p) => !p);
  }

  function goPrev() {
    ctrlRef.current?.stop();
    setIndex((i) => Math.max(0, i - 1));
  }

  function goNext() {
    ctrlRef.current?.stop();
    if (isLast) setPlaying(false);
    else setIndex((i) => i + 1);
  }

  if (!scene) return null;

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-black/90 p-4 backdrop-blur-sm sm:p-8">
      <div className="mx-auto flex w-full max-w-4xl flex-1 flex-col">
        {/* Top bar */}
        <div className="mb-3 flex items-center justify-between gap-3 text-white">
          <div className="min-w-0">
            <p className="text-xs uppercase tracking-wide text-white/60">
              Now playing
            </p>
            <p className="truncate text-lg font-bold">{title || "My Movie"}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="shrink-0 rounded-full bg-white/15 px-4 py-2 text-sm font-semibold text-white transition hover:bg-white/25 active:scale-95"
          >
            ✕ Close
          </button>
        </div>

        {/* Stage */}
        <div className="relative aspect-video w-full overflow-hidden rounded-3xl bg-black shadow-2xl ring-1 ring-white/10">
          {scene.videoUrl ? (
            <video
              key={scene.id}
              ref={videoRef}
              className="h-full w-full object-cover"
              src={scene.videoUrl}
              poster={scene.imageUrl ?? undefined}
              autoPlay
              loop
              muted
              playsInline
            />
          ) : scene.imageUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={scene.imageUrl}
              alt={scene.title}
              className="h-full w-full object-cover"
            />
          ) : (
            <div
              className={`flex h-full w-full items-center justify-center bg-gradient-to-br ${scene.palette} p-6 text-center`}
            >
              <p className="animate-bob text-xl font-semibold text-white drop-shadow">
                {scene.narration}
              </p>
            </div>
          )}

          {/* Scene title chip */}
          <div className="absolute left-3 top-3 rounded-full bg-black/50 px-3 py-1 text-sm font-semibold text-white">
            {index + 1}. {scene.title}
          </div>

          {/* Dialogue captions overlaid at the bottom */}
          {lines.length > 0 && (
            <div className="absolute inset-x-0 bottom-0 space-y-1 bg-gradient-to-t from-black/80 to-transparent p-4 pt-10">
              {lines.map((l, i) => (
                <p
                  key={i}
                  className="text-center text-base font-medium text-white drop-shadow sm:text-lg"
                >
                  <span className="font-bold text-rose-300">
                    {l.speaker || "Someone"}:
                  </span>{" "}
                  <span className="italic">“{l.line}”</span>
                </p>
              ))}
            </div>
          )}
        </div>

        {/* Progress dots */}
        <div className="mt-4 flex items-center justify-center gap-2">
          {scenes.map((s, i) => (
            <button
              key={s.id}
              type="button"
              aria-label={`Go to scene ${i + 1}`}
              onClick={() => {
                ctrlRef.current?.stop();
                setIndex(i);
              }}
              className={`h-2.5 rounded-full transition-all ${
                i === index ? "w-8 bg-white" : "w-2.5 bg-white/40 hover:bg-white/60"
              }`}
            />
          ))}
        </div>

        {/* Controls */}
        <div className="mt-4 flex items-center justify-center gap-3">
          <button
            type="button"
            onClick={goPrev}
            disabled={index === 0}
            className="rounded-full bg-white/15 px-4 py-2 text-sm font-semibold text-white transition hover:bg-white/25 active:scale-95 disabled:opacity-30"
          >
            ⏮ Prev
          </button>
          <button
            type="button"
            onClick={togglePlay}
            className="rounded-full bg-white px-6 py-3 text-base font-bold text-purple-700 shadow transition hover:bg-white/90 active:scale-95"
          >
            {playing ? "⏸ Pause" : isLast ? "🔁 Replay" : "▶️ Play"}
          </button>
          <button
            type="button"
            onClick={goNext}
            disabled={isLast}
            className="rounded-full bg-white/15 px-4 py-2 text-sm font-semibold text-white transition hover:bg-white/25 active:scale-95 disabled:opacity-30"
          >
            Next ⏭
          </button>
        </div>

        <p className="mt-3 text-center text-sm text-white/50">
          Scene {index + 1} of {scenes.length}
        </p>
      </div>
    </div>
  );
}
