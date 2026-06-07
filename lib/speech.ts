// Lightweight wrapper around the browser Web Speech API (no API cost).

import type { VoiceGender } from "./types";

const VOICE_KEY = "storyStudioVoice";
let preferredVoiceURI: string | null = null;

export function speechSupported(): boolean {
  return typeof window !== "undefined" && "speechSynthesis" in window;
}

/** All voices the browser offers (may be empty until "voiceschanged" fires). */
export function listVoices(): SpeechSynthesisVoice[] {
  if (!speechSupported()) return [];
  return window.speechSynthesis.getVoices();
}

/** English voices first, then the rest — what we show students to choose from. */
export function listEnglishVoices(): SpeechSynthesisVoice[] {
  return listVoices().filter((v) => v.lang.toLowerCase().startsWith("en"));
}

/** Subscribe to the async voice list loading. Returns an unsubscribe fn. */
export function onVoicesChanged(cb: () => void): () => void {
  if (!speechSupported()) return () => {};
  window.speechSynthesis.addEventListener("voiceschanged", cb);
  return () => window.speechSynthesis.removeEventListener("voiceschanged", cb);
}

export function getPreferredVoiceURI(): string | null {
  if (preferredVoiceURI) return preferredVoiceURI;
  if (typeof window !== "undefined") {
    preferredVoiceURI = localStorage.getItem(VOICE_KEY);
  }
  return preferredVoiceURI;
}

export function setPreferredVoiceURI(uri: string | null) {
  preferredVoiceURI = uri;
  if (typeof window === "undefined") return;
  if (uri) localStorage.setItem(VOICE_KEY, uri);
  else localStorage.removeItem(VOICE_KEY);
}

function resolveVoice(): SpeechSynthesisVoice | null {
  const uri = getPreferredVoiceURI();
  if (!uri) return null;
  return listVoices().find((v) => v.voiceURI === uri) || null;
}

/** Speaks the given text, cancelling anything already playing. */
export function speak(text: string, onEnd?: () => void): boolean {
  if (!speechSupported() || !text.trim()) return false;
  window.speechSynthesis.cancel();
  const utterance = new SpeechSynthesisUtterance(text);
  const voice = resolveVoice();
  if (voice) {
    utterance.voice = voice;
    utterance.lang = voice.lang;
  }
  utterance.rate = 0.95;
  utterance.pitch = 1.05;
  if (onEnd) utterance.onend = onEnd;
  window.speechSynthesis.speak(utterance);
  return true;
}

export function stopSpeaking() {
  if (speechSupported()) window.speechSynthesis.cancel();
}

export type SpokenLine = {
  text: string;
  /** A specific voice to use; falls back to the student's preferred voice. */
  voiceURI?: string;
  pitch?: number;
  rate?: number;
};

/**
 * Speaks a list of lines one after another (e.g. a scene's dialogue), each in
 * its own voice. Returns false if speech isn't available. Call stopSpeaking()
 * to interrupt.
 */
export function speakSequence(
  lines: SpokenLine[],
  onDone?: () => void
): boolean {
  if (!speechSupported() || lines.length === 0) return false;
  window.speechSynthesis.cancel();
  let i = 0;
  const next = () => {
    if (i >= lines.length) {
      onDone?.();
      return;
    }
    const l = lines[i++];
    const utterance = new SpeechSynthesisUtterance(l.text);
    const voice = l.voiceURI
      ? listVoices().find((v) => v.voiceURI === l.voiceURI) || resolveVoice()
      : resolveVoice();
    if (voice) {
      utterance.voice = voice;
      utterance.lang = voice.lang;
    }
    utterance.rate = l.rate ?? 0.95;
    utterance.pitch = l.pitch ?? 1.05;
    utterance.onend = next;
    utterance.onerror = next;
    window.speechSynthesis.speak(utterance);
  };
  next();
  return true;
}

// The Web Speech API doesn't expose a voice's gender, so we infer it from the
// voice name using common platform naming (Windows, macOS, Google, etc.).
const FEMALE_VOICE_NAMES = [
  "zira", "hazel", "susan", "samantha", "victoria", "karen", "moira",
  "tessa", "fiona", "veena", "allison", "ava", "serena", "kate", "catherine",
  "amelie", "anna", "helena", "linda", "heather", "aria", "jenny", "michelle",
  "nicky", "kathy", "joana", "luciana", "paulina", "sara", "zuzana",
];
const MALE_VOICE_NAMES = [
  "david", "mark", "george", "james", "richard", "alex", "daniel", "fred",
  "tom", "aaron", "arthur", "oliver", "ryan", "guy", "eric", "jacob", "bruce",
  "albert", "rishi", "diego", "jorge", "juan", "thomas", "paul", "gordon",
];

function classifyVoiceGender(voice: SpeechSynthesisVoice): VoiceGender {
  const n = voice.name.toLowerCase();
  if (n.includes("female")) return "female";
  if (n.includes("male")) return "male"; // safe: "female" already handled
  if (FEMALE_VOICE_NAMES.some((x) => n.includes(x))) return "female";
  if (MALE_VOICE_NAMES.some((x) => n.includes(x))) return "male";
  return "neutral";
}

function pickGenderedVoice(
  voices: SpeechSynthesisVoice[],
  gender: VoiceGender,
  hash: number
): SpeechSynthesisVoice | undefined {
  if (voices.length === 0) return undefined;
  if (gender === "male" || gender === "female") {
    const pool = voices.filter((v) => classifyVoiceGender(v) === gender);
    if (pool.length > 0) return pool[hash % pool.length];
  }
  return voices[hash % voices.length];
}

// Pitch biases reinforce gender — and stand in for it when a device only has
// one voice. Male = lower, female = higher, neutral = middle, all with variety.
function pitchForGender(gender: VoiceGender, hash: number): number {
  const j = hash % 5;
  if (gender === "male") return 0.7 + j * 0.05; // 0.70 - 0.90
  if (gender === "female") return 1.15 + j * 0.06; // 1.15 - 1.39
  return 0.9 + j * 0.1; // 0.90 - 1.30
}

/**
 * Gives each character a stable, distinct voice + pitch so the cast sounds
 * different from one another, matched to the character's voice gender.
 * Deterministic for a given speaker name.
 */
export function voiceForSpeaker(
  speaker: string,
  gender: VoiceGender = "neutral"
): { voiceURI?: string; pitch: number } {
  const name = (speaker || "").trim().toLowerCase();
  const voices = listEnglishVoices();
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = (hash * 31 + name.charCodeAt(i)) % 1000000007;
  }
  // The narrator keeps a neutral, steady voice.
  if (name === "narrator" || name === "") {
    return { voiceURI: voices[0]?.voiceURI, pitch: 1 };
  }
  const voice = pickGenderedVoice(voices, gender, hash);
  return { voiceURI: voice?.voiceURI, pitch: pitchForGender(gender, hash) };
}

/** Looks up a speaker's voice gender from the story's character list. */
export function genderForSpeaker(
  speaker: string,
  characters: { name: string; voice?: VoiceGender }[]
): VoiceGender {
  const s = (speaker || "").trim().toLowerCase();
  if (!s || s === "narrator") return "neutral";
  const exact = characters.find((c) => c.name.trim().toLowerCase() === s);
  if (exact?.voice) return exact.voice;
  // Fall back to a partial match (e.g. speaker "Captain Luna" vs character "Luna").
  const partial = characters.find((c) => {
    const cn = c.name.trim().toLowerCase();
    return cn && (s.includes(cn) || cn.includes(s));
  });
  return partial?.voice ?? "neutral";
}
