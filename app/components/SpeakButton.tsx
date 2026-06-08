"use client";

import { useEffect, useRef, useState } from "react";
import type { VoiceGender } from "@/lib/types";
import { playLines, SPEECH_START_EVENT, type SpeechController } from "@/lib/tts";

export default function SpeakButton({
  text,
  label = "Read aloud",
  className = "",
  speaker = "Narrator",
  gender = "neutral",
  voice,
}: {
  text: string;
  label?: string;
  className?: string;
  /** Who is speaking — used to pick a matching TTS voice. */
  speaker?: string;
  gender?: VoiceGender;
  /** Explicit voice id chosen by the student; overrides the auto pick. */
  voice?: string;
}) {
  const [speaking, setSpeaking] = useState(false);
  const ctrlRef = useRef<SpeechController | null>(null);

  useEffect(() => {
    // When any other SpeakButton (or dialogue player) starts, stop this one.
    const reset = () => {
      ctrlRef.current?.stop();
      setSpeaking(false);
    };
    window.addEventListener(SPEECH_START_EVENT, reset);
    return () => {
      window.removeEventListener(SPEECH_START_EVENT, reset);
      ctrlRef.current?.stop();
    };
  }, []);

  function toggle() {
    if (speaking) {
      ctrlRef.current?.stop();
      setSpeaking(false);
      return;
    }
    if (!text.trim()) return;
    // playLines() stops any other audio and broadcasts SPEECH_START_EVENT.
    ctrlRef.current = playLines([{ text, speaker, gender, voice }], () =>
      setSpeaking(false)
    );
    setSpeaking(true);
  }

  return (
    <button
      type="button"
      onClick={toggle}
      aria-label={speaking ? "Stop reading" : label}
      className={
        className ||
        "inline-flex items-center gap-1 rounded-full bg-purple-100 px-3 py-1 text-sm font-semibold text-purple-700 transition hover:bg-purple-200 active:scale-95"
      }
    >
      {speaking ? "⏹ Stop" : `🔊 ${label}`}
    </button>
  );
}
