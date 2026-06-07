"use client";

import { useEffect, useState } from "react";
import {
  getPreferredVoiceURI,
  listEnglishVoices,
  onVoicesChanged,
  setPreferredVoiceURI,
  speak,
  speechSupported,
} from "@/lib/speech";

// Lets a student pick which narrator voice reads their story aloud, and hear a
// quick sample. The choice is remembered (localStorage) for every Read-aloud.
export default function VoicePicker() {
  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>([]);
  const [selected, setSelected] = useState<string>("");
  const [supported, setSupported] = useState(false);

  useEffect(() => {
    if (!speechSupported()) return;
    setSupported(true);
    const load = () => {
      setVoices(listEnglishVoices());
      setSelected(getPreferredVoiceURI() ?? "");
    };
    load();
    const off = onVoicesChanged(load);
    return off;
  }, []);

  if (!supported || voices.length === 0) return null;

  function choose(uri: string) {
    setSelected(uri);
    setPreferredVoiceURI(uri || null);
    // Give an instant taste of the new voice.
    speak("Hi! I'll read your story like this.");
  }

  return (
    <label className="inline-flex items-center gap-1 rounded-full bg-purple-100 px-2.5 py-1 text-sm font-semibold text-purple-700">
      <span aria-hidden>🎙️</span>
      <span className="sr-only">Choose a reading voice</span>
      <select
        value={selected}
        onChange={(e) => choose(e.target.value)}
        className="max-w-[8.5rem] cursor-pointer truncate bg-transparent pr-1 font-semibold text-purple-700 outline-none"
        aria-label="Choose a reading voice"
      >
        <option value="">Default voice</option>
        {voices.map((v) => (
          <option key={v.voiceURI} value={v.voiceURI}>
            {v.name}
          </option>
        ))}
      </select>
    </label>
  );
}
