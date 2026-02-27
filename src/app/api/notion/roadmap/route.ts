import { NextResponse } from "next/server";
import { getRoadmapItems } from "@/lib/notion";

export async function GET() {
  try {
    const items = await getRoadmapItems();
    return NextResponse.json({ items });
  } catch (error: any) {
    return NextResponse.json(
      { error: error.message || "Failed to fetch roadmap" },
      { status: 500 }
    );
  }
}
