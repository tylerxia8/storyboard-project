import { NextRequest, NextResponse } from "next/server";
import { getFeedback } from "@/lib/ai";
import { moderateText } from "@/lib/safety";

export async function POST(req: NextRequest) {
  try {
    const { story } = await req.json();
    if (typeof story !== "string") {
      return NextResponse.json(
        { error: "Please send your story text." },
        { status: 400 }
      );
    }

    // Don't coach on unsafe content; gently redirect instead.
    const check = await moderateText(story);
    if (!check.safe) {
      return NextResponse.json({ blocked: true, message: check.kidMessage });
    }

    const feedback = await getFeedback(story);
    return NextResponse.json(feedback);
  } catch {
    return NextResponse.json(
      { error: "Oops! Something went wrong getting your feedback." },
      { status: 500 }
    );
  }
}
