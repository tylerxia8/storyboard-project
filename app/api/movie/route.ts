import { NextRequest, NextResponse } from "next/server";
import { storyToScenes, startScenes, hasVideoAI } from "@/lib/ai";
import type { MovieResponse } from "@/lib/types";

export async function POST(req: NextRequest) {
  try {
    const { story } = await req.json();
    if (typeof story !== "string" || story.trim().length === 0) {
      return NextResponse.json(
        { error: "Write a little story first, then make your movie!" },
        { status: 400 }
      );
    }

    const { title, scenes: rawScenes } = await storyToScenes(story);
    const scenes = await startScenes(rawScenes);

    const response: MovieResponse = {
      title,
      scenes,
      mock: !hasVideoAI,
    };
    return NextResponse.json(response);
  } catch {
    return NextResponse.json(
      { error: "Oops! Something went wrong making your movie." },
      { status: 500 }
    );
  }
}
