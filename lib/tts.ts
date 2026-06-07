// Plays character dialogue using OpenAI's gpt-4o-mini-tts for natural,
// expressive voices, with automatic fallback to the browser's built-in speech
// (Web Speech API) when no OpenAI key is configured or a request fails.

import {
  speakSequence,
  stopSpeaking,
  voiceForSpeaker,
} from "./speech";
import type { VoiceGender } from "./types";

export type SpeakLine = {
  text: string;
  speaker: string;
  gender: VoiceGender;
};

export type SpeechController = { stop: () => void };

// Dispatched when any speech starts, so read-aloud buttons can reset their UI.
export const SPEECH_START_EVENT = "storystudio:speakstart";

// Only one thing speaks at a time across the whole app.
let activeController: SpeechController | null = null;

// OpenAI voices grouped by perceived gender, so a character's voice matches.
const FEMALE_VOICES = ["coral", "shimmer", "nova", "sage"];
const MALE_VOICES = ["onyx", "echo", "ash", "ballad"];
const NEUTRAL_VOICES = ["alloy", "fable"];

function hashString(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) % 1000000007;
  return h;
}

/** Picks a stable OpenAI voice for a speaker, matched to their gender. */
function openAiVoiceFor(speaker: string, gender: VoiceGender): string {
  const name = (speaker || "").trim().toLowerCase();
  if (name === "narrator" || name === "") return "fable";
  const pool =
    gender === "male"
      ? MALE_VOICES
      : gender === "female"
        ? FEMALE_VOICES
        : NEUTRAL_VOICES;
  return pool[hashString(name) % pool.length];
}

/** Steers the delivery toward a warm, kid-movie performance. */
function instructionsFor(gender: VoiceGender, speaker: string): string {
  const who = speaker && speaker.toLowerCase() !== "narrator" ? speaker : "the narrator";
  const tone =
    "Perform this line for a children's animated movie: warm, lively, and " +
    "expressive, with clear, friendly diction and natural emotion.";
  const voiceHint =
    gender === "male"
      ? " Use a boyish or manly character voice as fits the words."
      : gender === "female"
        ? " Use a girlish or womanly character voice as fits the words."
        : "";
  return `${tone} You are voicing ${who}.${voiceHint}`;
}

// Cache generated audio so replaying a line is instant and saves API calls.
const audioCache = new Map<string, string>();

async function fetchLineAudio(
  text: string,
  voice: string,
  instructions: string
): Promise<string> {
  const key = `${voice}|${instructions}|${text}`;
  const cached = audioCache.get(key);
  if (cached) return cached;
  const res = await fetch("/api/tts", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text, voice, instructions }),
  });
  if (!res.ok) throw new Error(`tts ${res.status}`);
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  audioCache.set(key, url);
  return url;
}

/**
 * Speaks a list of dialogue lines in order, each in a voice matched to the
 * character. Returns a controller with stop(). Falls back to the browser voice
 * if OpenAI TTS isn't available.
 */
export function playLines(
  lines: SpeakLine[],
  onDone?: () => void
): SpeechController {
  // Stop whatever is currently playing, and tell buttons to reset their state.
  activeController?.stop();
  if (typeof window !== "undefined") {
    window.dispatchEvent(new Event(SPEECH_START_EVENT));
  }

  let cancelled = false;
  const audio =
    typeof Audio !== "undefined" ? new Audio() : null;

  const stop = () => {
    cancelled = true;
    if (audio) {
      audio.pause();
      audio.onended = null;
      audio.onerror = null;
      audio.src = "";
    }
    stopSpeaking();
    if (activeController === controller) activeController = null;
  };

  const controller: SpeechController = { stop };
  activeController = controller;

  const webFallback = () => {
    if (cancelled) return;
    const ok = speakSequence(
      lines.map((l) => {
        const v = voiceForSpeaker(l.speaker, l.gender);
        return { text: l.text, voiceURI: v.voiceURI, pitch: v.pitch };
      }),
      onDone
    );
    // If the browser can't speak either, still signal completion so callers
    // don't get stuck in a "speaking" state.
    if (!ok) onDone?.();
  };

  if (!audio || lines.length === 0) {
    if (lines.length === 0) onDone?.();
    else webFallback();
    return controller;
  }

  (async () => {
    let urls: string[];
    try {
      urls = await Promise.all(
        lines.map((l) =>
          fetchLineAudio(
            l.text,
            openAiVoiceFor(l.speaker, l.gender),
            instructionsFor(l.gender, l.speaker)
          )
        )
      );
    } catch {
      // No key / network / API error → use the browser voice instead.
      webFallback();
      return;
    }
    if (cancelled) return;

    const playFrom = (idx: number) => {
      if (cancelled) return;
      if (idx >= urls.length) {
        onDone?.();
        return;
      }
      audio.src = urls[idx];
      audio.onended = () => playFrom(idx + 1);
      audio.onerror = () => playFrom(idx + 1);
      const p = audio.play();
      if (p) p.catch(() => webFallback());
    };
    playFrom(0);
  })();

  return controller;
}
