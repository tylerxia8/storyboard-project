"use client";

import { useEffect, useRef, useState } from "react";

// Minimal typings for the Web Speech API (not in the standard TS lib.dom).
type SpeechResult = { 0: { transcript: string }; isFinal: boolean };
type SpeechResultEvent = {
  resultIndex: number;
  results: ArrayLike<SpeechResult>;
};
type Recognition = {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  start: () => void;
  stop: () => void;
  onresult: ((e: SpeechResultEvent) => void) | null;
  onend: (() => void) | null;
  onerror: (() => void) | null;
};

function createRecognition(): Recognition | null {
  if (typeof window === "undefined") return null;
  const w = window as unknown as {
    SpeechRecognition?: new () => Recognition;
    webkitSpeechRecognition?: new () => Recognition;
  };
  const Ctor = w.SpeechRecognition || w.webkitSpeechRecognition;
  return Ctor ? new Ctor() : null;
}

export default function DictateButton({
  onText,
  lang = "en-US",
}: {
  onText: (text: string) => void;
  lang?: string;
}) {
  const [supported, setSupported] = useState(false);
  const [listening, setListening] = useState(false);
  const recRef = useRef<Recognition | null>(null);

  useEffect(() => {
    setSupported(createRecognition() !== null);
    return () => {
      try {
        recRef.current?.stop();
      } catch {
        // ignore
      }
    };
  }, []);

  if (!supported) return null;

  function start() {
    const rec = createRecognition();
    if (!rec) return;
    rec.lang = lang;
    rec.continuous = true;
    rec.interimResults = false;
    rec.onresult = (e) => {
      let finalText = "";
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const r = e.results[i];
        if (r.isFinal) finalText += r[0].transcript;
      }
      finalText = finalText.trim();
      if (finalText) onText(finalText);
    };
    rec.onend = () => setListening(false);
    rec.onerror = () => setListening(false);
    recRef.current = rec;
    rec.start();
    setListening(true);
  }

  function stop() {
    try {
      recRef.current?.stop();
    } catch {
      // ignore
    }
    setListening(false);
  }

  return (
    <button
      type="button"
      onClick={() => (listening ? stop() : start())}
      aria-label={listening ? "Stop dictation" : "Speak your story"}
      className={
        listening
          ? "inline-flex items-center gap-1 rounded-full bg-rose-500 px-3 py-1 text-sm font-semibold text-white shadow transition active:scale-95"
          : "inline-flex items-center gap-1 rounded-full bg-pink-100 px-3 py-1 text-sm font-semibold text-pink-700 transition hover:bg-pink-200 active:scale-95"
      }
    >
      {listening ? "⏹ Listening..." : "🎤 Speak"}
    </button>
  );
}
