import { NextRequest, NextResponse } from "next/server";
import { startScenes, hasVideoAI, type VideoSceneInput } from "@/lib/ai";
import { moderateText } from "@/lib/safety";
import type { MovieResponse, Rating, ScriptLine, StyleGuide } from "@/lib/types";

/** Keep only well-formed dialogue lines from an untrusted request body. */
function parseScript(raw: unknown): ScriptLine[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((d) => {
      const o = (d ?? {}) as Partial<ScriptLine>;
      return {
        speaker: String(o.speaker ?? "").trim().slice(0, 40),
        line: String(o.line ?? "").trim().slice(0, 200),
      };
    })
    .filter((d) => d.line.length > 0)
    .slice(0, 6);
}

export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const rating: Rating = body.rating === "teens" ? "teens" : "kids";
    const rawScenes = Array.isArray(body.scenes) ? body.scenes : [];

    const inputs: VideoSceneInput[] = rawScenes
      .map((s: Partial<VideoSceneInput>) => ({
        id: typeof s.id === "string" ? s.id : undefined,
        title: String(s.title || "A Scene"),
        description: String(s.description || ""),
        palette: typeof s.palette === "string" ? s.palette : undefined,
        imageUrl: typeof s.imageUrl === "string" ? s.imageUrl : null,
        script: parseScript((s as { script?: unknown }).script),
      }))
      .filter((s: VideoSceneInput) => s.description.trim().length > 0);

    if (inputs.length === 0) {
      return NextResponse.json(
        { error: "Add at least one scene before making the video!" },
        { status: 400 }
      );
    }

    // Safety gate on the (possibly edited) scene descriptions AND spoken lines.
    const combined = inputs
      .map((s) => {
        const lines = (s.script ?? [])
          .map((d) => `${d.speaker}: ${d.line}`)
          .join("\n");
        return `${s.title}\n${s.description}${lines ? `\n${lines}` : ""}`;
      })
      .join("\n\n");
    const check = await moderateText(combined, rating);
    if (!check.safe) {
      return NextResponse.json({
        blocked: true,
        message: check.kidMessage,
        terms: check.flaggedTerms ?? [],
      });
    }

    const scenes = await startScenes(
      inputs,
      rating,
      body.styleGuide as StyleGuide | undefined
    );
    return NextResponse.json({
      title: "",
      scenes,
      mock: !hasVideoAI,
    } satisfies MovieResponse);
  } catch {
    return NextResponse.json(
      { error: "Oops! Something went wrong making your video." },
      { status: 500 }
    );
  }
}
