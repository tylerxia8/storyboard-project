import { NextRequest, NextResponse } from "next/server";
import OpenAI from "openai";

export const runtime = "nodejs";
export const maxDuration = 60;

const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
// High-quality, steerable TTS. Override via env if desired.
const TTS_MODEL = process.env.OPENAI_TTS_MODEL || "gpt-4o-mini-tts";

// Allowed OpenAI voices (guards against arbitrary input).
const VOICES = new Set([
  "alloy", "ash", "ballad", "coral", "echo", "fable",
  "nova", "onyx", "sage", "shimmer", "verse",
]);

// Turns a line of dialogue into natural-sounding speech with gpt-4o-mini-tts.
export async function POST(req: NextRequest) {
  if (!OPENAI_API_KEY) {
    // No key: tell the client to fall back to the browser voice.
    return NextResponse.json({ error: "tts_unavailable" }, { status: 503 });
  }
  try {
    const body = await req.json();
    const text = String(body.text || "").trim();
    if (!text) {
      return NextResponse.json({ error: "empty" }, { status: 400 });
    }
    const voice = VOICES.has(body.voice) ? (body.voice as string) : "alloy";
    const instructions =
      typeof body.instructions === "string" && body.instructions.trim()
        ? body.instructions.slice(0, 500)
        : undefined;

    const client = new OpenAI({ apiKey: OPENAI_API_KEY });
    const speech = await client.audio.speech.create({
      model: TTS_MODEL,
      voice,
      input: text.slice(0, 4000),
      instructions,
      response_format: "mp3",
    });

    const buffer = Buffer.from(await speech.arrayBuffer());
    return new NextResponse(new Uint8Array(buffer), {
      headers: {
        "Content-Type": "audio/mpeg",
        "Cache-Control": "no-store",
      },
    });
  } catch (err) {
    console.error("TTS failed:", err);
    return NextResponse.json({ error: "tts_failed" }, { status: 500 });
  }
}
