import { NextRequest, NextResponse } from "next/server";
import { getPredictionStatus } from "@/lib/ai";
import type { Rating, StatusResponse } from "@/lib/types";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const id = req.nextUrl.searchParams.get("id");
  if (!id) {
    return NextResponse.json({ error: "Missing prediction id." }, { status: 400 });
  }
  const rating: Rating =
    req.nextUrl.searchParams.get("rating") === "teens" ? "teens" : "kids";
  const result = await getPredictionStatus(id, rating);
  return NextResponse.json(result satisfies StatusResponse);
}
