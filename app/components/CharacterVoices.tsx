"use client";

import { useEffect, useRef, useState } from "react";
import type { StyleCharacter, VoiceGender } from "@/lib/types";
import { genderForSpeaker } from "@/lib/speech";
import {
  VOICE_OPTIONS,
  playLines,
  type SpeechController,
} from "@/lib/tts";

// Lets kids change the voice of any character (or the narrator) if they don't
// like the one that was picked for them. Choices are remembered by the parent
// and used everywhere the movie speaks.
export default function CharacterVoices({
  characters,
  overrides,
  onChange,
}: {
  characters: StyleCharacter[];
  /** name (lowercased) -> chosen voice id. Empty/missing = auto. */
  overrides: Record<string, string>;
  onChange: (name: string, voiceId: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const ctrlRef = useRef<SpeechController | null>(null);

  useEffect(() => () => ctrlRef.current?.stop(), []);

  // Narrator first, then each named character.
  const rows: { name: string; gender: VoiceGender }[] = [
    { name: "Narrator", gender: "neutral" },
    ...characters.map((c) => ({
      name: c.name,
      gender: genderForSpeaker(c.name, characters),
    })),
  ];

  function preview(name: string, gender: VoiceGender, voiceId: string) {
    ctrlRef.current?.stop();
    const who = name.toLowerCase() === "narrator" ? "the narrator" : name;
    ctrlRef.current = playLines([
      {
        text: `Hi! I'm ${who}, and this is how I sound.`,
        speaker: name,
        gender,
        voice: voiceId || undefined,
      },
    ]);
  }

  return (
    <div className="rounded-2xl bg-white p-3 shadow ring-1 ring-purple-100">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="flex w-full items-center justify-between gap-2 text-left"
      >
        <span className="text-base font-bold text-purple-700">
          🎤 Character voices{" "}
          <span className="font-normal text-purple-400">
            — don&apos;t like a voice? Change it!
          </span>
        </span>
        <span className="shrink-0 text-purple-400">{open ? "▲" : "▼"}</span>
      </button>

      {open && (
        <div className="mt-3 space-y-2">
          {rows.map((row) => {
            const key = row.name.trim().toLowerCase();
            const value = overrides[key] ?? "";
            return (
              <div key={key} className="flex items-center gap-2">
                <span className="w-20 shrink-0 truncate text-sm font-semibold text-purple-700">
                  {row.name}
                </span>
                <select
                  value={value}
                  onChange={(e) => {
                    onChange(row.name, e.target.value);
                    preview(row.name, row.gender, e.target.value);
                  }}
                  aria-label={`Voice for ${row.name}`}
                  className="min-w-0 flex-1 cursor-pointer truncate rounded-lg border-2 border-purple-100 bg-purple-50/40 px-2 py-1.5 text-sm font-semibold text-purple-700 outline-none transition focus:border-purple-300 focus:bg-white"
                >
                  <option value="">✨ Auto (pick for me)</option>
                  {VOICE_OPTIONS.map((v) => (
                    <option key={v.id} value={v.id}>
                      {v.label}
                    </option>
                  ))}
                </select>
                <button
                  type="button"
                  onClick={() => preview(row.name, row.gender, value)}
                  aria-label={`Hear ${row.name}'s voice`}
                  title="Hear this voice"
                  className="shrink-0 rounded-lg bg-rose-500 px-2.5 py-1.5 text-sm font-bold text-white shadow-sm transition hover:bg-rose-400 active:scale-95"
                >
                  ▶️
                </button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
