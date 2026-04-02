import { NextResponse } from "next/server";
import { seedRubsData, isSeeded } from "@/lib/rubs-seed";

export async function GET() {
  try {
    return NextResponse.json({ seeded: isSeeded() });
  } catch (error: any) {
    return NextResponse.json({ error: error.message || "Failed to check seed status" }, { status: 500 });
  }
}

export async function POST() {
  try {
    const result = seedRubsData();
    return NextResponse.json({ ok: true, ...result });
  } catch (error: any) {
    return NextResponse.json({ error: error.message || "Failed to seed data" }, { status: 500 });
  }
}
