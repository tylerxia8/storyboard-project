"use client";

import { useEffect, useId, useRef, useState } from "react";
import type { StyleCharacter, ScriptLine } from "@/lib/types";
import { genderForSpeaker, speechSupported } from "@/lib/speech";
import { playLines, type SpeechController } from "@/lib/tts";

// Lets a student write the spoken lines for a scene during the storyboard
// phase. Each line has a speaker (a character) and what they say. The lines are
// voiced — each character in their own voice — in the finished movie.
export default function ScriptEditor({
  script,
  characters,
  onChange,
}: {
  script: ScriptLine[];
  characters: StyleCharacter[];
  onChange: (script: ScriptLine[]) => void;
}) {
  const [playing, setPlaying] = useState(false);
  const [canSpeak, setCanSpeak] = useState(false);
  const listId = useId();
  const ctrlRef = useRef<SpeechController | null>(null);

  useEffect(() => {
    // TTS works whenever there's a server route; the browser voice is just a
    // fallback, so showing the control whenever speech is plausible is fine.
    setCanSpeak(speechSupported() || typeof window !== "undefined");
    return () => ctrlRef.current?.stop();
  }, []);

  function update(i: number, patch: Partial<ScriptLine>) {
    onChange(script.map((l, idx) => (idx === i ? { ...l, ...patch } : l)));
  }

  function addLine() {
    const speaker =
      characters[script.length % Math.max(characters.length, 1)]?.name || "";
    onChange([...script, { speaker, line: "" }]);
  }

  function removeLine(i: number) {
    onChange(script.filter((_, idx) => idx !== i));
  }

  const spokenLines = script.filter((l) => l.line.trim().length > 0);

  function play() {
    if (playing) {
      ctrlRef.current?.stop();
      setPlaying(false);
      return;
    }
    if (spokenLines.length === 0) return;
    ctrlRef.current = playLines(
      spokenLines.map((l) => ({
        text: l.line,
        speaker: l.speaker,
        gender: genderForSpeaker(l.speaker, characters),
      })),
      () => setPlaying(false)
    );
    setPlaying(true);
  }

  return (
    <div className="mt-2 rounded-2xl bg-rose-50/70 p-3 ring-1 ring-rose-100">
      <div className="mb-1 flex items-center justify-between gap-2">
        <p className="text-sm font-semibold text-rose-600">
          🎬 Script <span className="font-normal text-rose-400">(what they say)</span>
        </p>
        {canSpeak && spokenLines.length > 0 && (
          <button
            type="button"
            onClick={play}
            className="shrink-0 rounded-full bg-rose-500 px-3 py-1 text-xs font-bold text-white shadow-sm transition hover:bg-rose-400 active:scale-95"
          >
            {playing ? "⏹ Stop" : "▶️ Hear the lines"}
          </button>
        )}
      </div>

      {characters.length > 0 && (
        <datalist id={listId}>
          {characters.map((c) => (
            <option key={c.name} value={c.name} />
          ))}
        </datalist>
      )}

      {script.length === 0 ? (
        <p className="mb-2 text-xs text-rose-400">
          Add lines so your characters can talk in the movie!
        </p>
      ) : (
        <div className="space-y-2">
          {script.map((l, i) => (
            <div key={i} className="flex items-start gap-1.5">
              <input
                value={l.speaker}
                onChange={(e) => update(i, { speaker: e.target.value })}
                list={characters.length > 0 ? listId : undefined}
                placeholder="Who?"
                aria-label={`Speaker for line ${i + 1}`}
                className="w-24 shrink-0 rounded-lg border border-rose-200 bg-white px-2 py-1.5 text-xs font-semibold text-rose-700 outline-none focus:border-rose-400"
              />
              <input
                value={l.line}
                onChange={(e) => update(i, { line: e.target.value })}
                placeholder="...says what?"
                aria-label={`Line ${i + 1}`}
                className="min-w-0 flex-1 rounded-lg border border-rose-200 bg-white px-2 py-1.5 text-sm text-gray-800 outline-none focus:border-rose-400"
              />
              <button
                type="button"
                onClick={() => removeLine(i)}
                aria-label={`Remove line ${i + 1}`}
                className="shrink-0 rounded-lg px-1.5 py-1.5 text-rose-400 transition hover:bg-rose-100 hover:text-rose-600 active:scale-95"
              >
                ✕
              </button>
            </div>
          ))}
        </div>
      )}

      <button
        type="button"
        onClick={addLine}
        className="mt-2 w-full rounded-lg border border-dashed border-rose-300 px-3 py-1.5 text-xs font-bold text-rose-500 transition hover:bg-rose-100 active:scale-95"
      >
        ➕ Add a line
      </button>
    </div>
  );
}
