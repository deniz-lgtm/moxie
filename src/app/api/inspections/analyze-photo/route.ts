import { NextRequest, NextResponse } from "next/server";
import { analyzePhoto } from "@/lib/ai-analysis";

export async function POST(req: NextRequest) {
  try {
    const { photoBase64, roomName, itemName } = await req.json();

    if (!photoBase64) {
      return NextResponse.json({ error: "No photo provided" }, { status: 400 });
    }

    const result = await analyzePhoto(photoBase64, roomName || "Unknown", itemName || "General");
    return NextResponse.json(result);
  } catch (error) {
    console.error("[analyze-photo] Error:", error);
    return NextResponse.json(
      { error: "Failed to analyze photo" },
      { status: 500 }
    );
  }
}
