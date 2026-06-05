import { NextRequest, NextResponse } from "next/server";
import { buildStoryboardScenes, hasImageAI } from "@/lib/ai";
import { moderateText } from "@/lib/safety";
import type { Rating, StoryboardResponse } from "@/lib/types";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  try {
    const { story, rating: rawRating } = await req.json();
    if (typeof story !== "string" || story.trim().length === 0) {
      return NextResponse.json(
        { error: "Write a little story first, then make your storyboard!" },
        { status: 400 }
      );
    }
    const rating: Rating = rawRating === "teens" ? "teens" : "kids";

    // Safety gate on the student's story before doing anything.
    const inputCheck = await moderateText(story, rating);
    if (!inputCheck.safe) {
      console.warn("Storyboard blocked (story):", inputCheck.categories);
      return NextResponse.json({ blocked: true, message: inputCheck.kidMessage });
    }

    const board = await buildStoryboardScenes(story, rating);

    // Safety gate on the AI-generated scene descriptions.
    const generatedText = board.scenes
      .map((s) => `${s.title}\n${s.description}`)
      .join("\n\n");
    const outputCheck = await moderateText(generatedText, rating);
    if (!outputCheck.safe) {
      console.warn("Storyboard blocked (generated):", outputCheck.categories);
      return NextResponse.json({ blocked: true, message: outputCheck.kidMessage });
    }

    return NextResponse.json({
      ...board,
      mock: !hasImageAI,
    } satisfies StoryboardResponse);
  } catch {
    return NextResponse.json(
      { error: "Oops! Something went wrong making your storyboard." },
      { status: 500 }
    );
  }
}
