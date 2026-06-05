"use client";

import { useEffect, useState } from "react";
import { speak, speechSupported, stopSpeaking } from "@/lib/speech";

const SPEAK_EVENT = "storystudio:speakstart";

export default function SpeakButton({
  text,
  label = "Read aloud",
  className = "",
}: {
  text: string;
  label?: string;
  className?: string;
}) {
  const [speaking, setSpeaking] = useState(false);
  const [supported, setSupported] = useState(false);

  useEffect(() => {
    setSupported(speechSupported());
    // When any other SpeakButton starts, reset this one's state.
    const reset = () => setSpeaking(false);
    window.addEventListener(SPEAK_EVENT, reset);
    return () => {
      window.removeEventListener(SPEAK_EVENT, reset);
      stopSpeaking();
    };
  }, []);

  if (!supported) return null;

  function toggle() {
    if (speaking) {
      stopSpeaking();
      setSpeaking(false);
      return;
    }
    if (!text.trim()) return;
    window.dispatchEvent(new Event(SPEAK_EVENT)); // stop other buttons
    const ok = speak(text, () => setSpeaking(false));
    if (ok) setSpeaking(true);
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
