import { NextRequest, NextResponse } from "next/server";
import { generateSceneImage } from "@/lib/ai";
import { moderateText } from "@/lib/safety";
import type { Rating, SceneImageResponse, StyleGuide } from "@/lib/types";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(req: NextRequest) {
  try {
    const { description, rating: rawRating, styleGuide } = await req.json();
    if (typeof description !== "string" || description.trim().length === 0) {
      return NextResponse.json(
        { error: "Describe the scene first, then redraw it!" },
        { status: 400 }
      );
    }
    const rating: Rating = rawRating === "teens" ? "teens" : "kids";

    const check = await moderateText(description, rating);
    if (!check.safe) {
      return NextResponse.json({ blocked: true, message: check.kidMessage });
    }

    const image = await generateSceneImage(
      description,
      rating,
      styleGuide as StyleGuide | undefined
    );
    return NextResponse.json(image satisfies SceneImageResponse);
  } catch {
    return NextResponse.json(
      { error: "Oops! Something went wrong drawing your scene." },
      { status: 500 }
    );
  }
}
