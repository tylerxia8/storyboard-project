"use client";

import { useEffect, useRef, useState } from "react";

// Minimal typings for the Web Speech API (not in the standard TS lib.dom).
type SpeechResult = { 0: { transcript: string }; isFinal: boolean };
type SpeechResultEvent = {
  resultIndex: number;
  results: ArrayLike<SpeechResult>;
};
type SpeechErrorEvent = { error: string };
type Recognition = {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  start: () => void;
  stop: () => void;
  abort: () => void;
  onresult: ((e: SpeechResultEvent) => void) | null;
  onend: (() => void) | null;
  onerror: ((e: SpeechErrorEvent) => void) | null;
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

function friendlyError(code: string): string {
  switch (code) {
    case "not-allowed":
    case "service-not-allowed":
      return "Microphone is blocked. Allow mic access in your browser, then tap Speak again.";
    case "no-speech":
      return "I didn't hear anything — try speaking a little louder.";
    case "audio-capture":
      return "No microphone found. Check that one is plugged in.";
    case "network":
      return "Speech needs an internet connection right now.";
    case "aborted":
      return "";
    default:
      return "Speech didn't work. Try again, or just type your story.";
  }
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
  const [hint, setHint] = useState<string | null>(null);
  const recRef = useRef<Recognition | null>(null);
  const gotResultRef = useRef(false);

  useEffect(() => {
    setSupported(createRecognition() !== null);
    return () => {
      try {
        recRef.current?.abort();
      } catch {
        // ignore
      }
    };
  }, []);

  if (!supported) return null;

  function start() {
    const rec = createRecognition();
    if (!rec) return;
    setHint(null);
    gotResultRef.current = false;
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
      if (finalText) {
        gotResultRef.current = true;
        onText(finalText);
      }
    };
    rec.onerror = (e) => {
      console.warn("Dictation error:", e?.error);
      const msg = friendlyError(e?.error || "");
      if (msg) setHint(msg);
      setListening(false);
    };
    rec.onend = () => {
      setListening(false);
      if (!gotResultRef.current) {
        setHint((h) => h ?? "I didn't catch anything — tap Speak and talk clearly.");
      }
    };
    recRef.current = rec;
    try {
      rec.start();
      setListening(true);
    } catch (err) {
      console.warn("Dictation start failed:", err);
      setHint("Couldn't start the microphone. Try tapping Speak again.");
    }
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
    <span className="relative inline-flex">
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
        {listening ? "🔴 Listening..." : "🎤 Speak"}
      </button>
      {hint && (
        <span className="absolute right-0 top-full z-10 mt-1 w-56 rounded-xl bg-rose-50 px-3 py-2 text-xs font-medium text-rose-700 shadow-lg ring-1 ring-rose-200">
          {hint}
        </span>
      )}
    </span>
  );
}
