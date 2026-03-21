import { NextRequest, NextResponse } from "next/server";
import { analyzeFloorPlan } from "@/lib/ai-analysis";

export async function POST(req: NextRequest) {
  try {
    const { imageBase64 } = await req.json();

    if (!imageBase64) {
      return NextResponse.json({ error: "No image provided" }, { status: 400 });
    }

    const rooms = await analyzeFloorPlan(imageBase64);
    return NextResponse.json({ rooms });
  } catch (error) {
    console.error("[analyze-floor-plan] Error:", error);
    return NextResponse.json(
      { error: "Failed to analyze floor plan" },
      { status: 500 }
    );
  }
}
