import { NextRequest, NextResponse } from "next/server";
import { getFeedback } from "@/lib/ai";

export async function POST(req: NextRequest) {
  try {
    const { story } = await req.json();
    if (typeof story !== "string") {
      return NextResponse.json(
        { error: "Please send your story text." },
        { status: 400 }
      );
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
