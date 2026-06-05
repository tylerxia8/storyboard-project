import { NextRequest, NextResponse } from "next/server";
import { storyToScenes, startScenes, hasVideoAI } from "@/lib/ai";
import { moderateText } from "@/lib/safety";
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

    // 1) Safety gate on the child's story before doing anything.
    const inputCheck = await moderateText(story);
    if (!inputCheck.safe) {
      console.warn("Movie blocked (story):", inputCheck.categories);
      return NextResponse.json({ blocked: true, message: inputCheck.kidMessage });
    }

    const { title, scenes: rawScenes } = await storyToScenes(story);

    // 2) Safety gate on the AI-generated scene prompts/narration before any
    // text is ever sent to the video model.
    const generatedText = rawScenes
      .map((s) => `${s.title}\n${s.narration}\n${s.prompt}`)
      .join("\n\n");
    const outputCheck = await moderateText(generatedText);
    if (!outputCheck.safe) {
      console.warn("Movie blocked (generated scenes):", outputCheck.categories);
      return NextResponse.json({ blocked: true, message: outputCheck.kidMessage });
    }

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
