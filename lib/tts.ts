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
  /** Explicit OpenAI voice id chosen by the student; overrides the auto pick. */
  voice?: string;
};

export type SpeechController = { stop: () => void };

// Dispatched when any speech starts, so read-aloud buttons can reset their UI.
export const SPEECH_START_EVENT = "storystudio:speakstart";

// Only one thing speaks at a time across the whole app.
let activeController: SpeechController | null = null;

/** A friendly, pick-from voice a student can choose for a character. */
export type VoiceOption = { id: string; label: string; gender: VoiceGender };

// The OpenAI gpt-4o-mini-tts voices, with kid-friendly descriptions. Kids can
// pick any of these for any character if they don't like the auto-chosen one.
export const VOICE_OPTIONS: VoiceOption[] = [
  { id: "coral", label: "Coral — bright & cheery", gender: "female" },
  { id: "nova", label: "Nova — peppy & fun", gender: "female" },
  { id: "shimmer", label: "Shimmer — soft & gentle", gender: "female" },
  { id: "sage", label: "Sage — calm & kind", gender: "female" },
  { id: "ash", label: "Ash — friendly & easygoing", gender: "male" },
  { id: "echo", label: "Echo — smooth & cool", gender: "male" },
  { id: "onyx", label: "Onyx — deep & bold", gender: "male" },
  { id: "ballad", label: "Ballad — warm & dramatic", gender: "male" },
  { id: "alloy", label: "Alloy — clear & neutral", gender: "neutral" },
  { id: "fable", label: "Fable — gentle storyteller", gender: "neutral" },
];

const VOICE_GENDER: Record<string, VoiceGender> = Object.fromEntries(
  VOICE_OPTIONS.map((v) => [v.id, v.gender])
);

// Voices grouped by perceived gender, so an auto-picked voice matches a
// character's gender.
const FEMALE_VOICES = VOICE_OPTIONS.filter((v) => v.gender === "female").map(
  (v) => v.id
);
const MALE_VOICES = VOICE_OPTIONS.filter((v) => v.gender === "male").map(
  (v) => v.id
);
const NEUTRAL_VOICES = VOICE_OPTIONS.filter((v) => v.gender === "neutral").map(
  (v) => v.id
);

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

/**
 * Looks up a student-chosen voice id for a speaker (case-insensitive by name).
 * Returns undefined when there's no override, so the auto voice is used.
 */
export function voiceOverrideFor(
  speaker: string,
  overrides?: Record<string, string>
): string | undefined {
  if (!overrides) return undefined;
  const v = overrides[(speaker || "").trim().toLowerCase()];
  return v && v.length > 0 ? v : undefined;
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
        lines.map((l) => {
          const voice = l.voice || openAiVoiceFor(l.speaker, l.gender);
          // When a voice was hand-picked, steer the delivery by THAT voice's
          // gender so the instructions don't fight the chosen voice.
          const gender = l.voice ? VOICE_GENDER[l.voice] ?? l.gender : l.gender;
          return fetchLineAudio(
            l.text,
            voice,
            instructionsFor(gender, l.speaker)
          );
        })
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
