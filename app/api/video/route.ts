import { NextRequest, NextResponse } from "next/server";
import { startScenes, hasVideoAI, type VideoSceneInput } from "@/lib/ai";
import { moderateText } from "@/lib/safety";
import type { MovieResponse, Rating } from "@/lib/types";

export const runtime = "nodejs";

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
      }))
      .filter((s: VideoSceneInput) => s.description.trim().length > 0);

    if (inputs.length === 0) {
      return NextResponse.json(
        { error: "Add at least one scene before making the video!" },
        { status: 400 }
      );
    }

    // Safety gate on the (possibly edited) scene descriptions.
    const combined = inputs.map((s) => `${s.title}\n${s.description}`).join("\n\n");
    const check = await moderateText(combined, rating);
    if (!check.safe) {
      return NextResponse.json({ blocked: true, message: check.kidMessage });
    }

    const scenes = await startScenes(inputs, rating);
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
