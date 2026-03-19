import { NextResponse } from "next/server";
import { fetchUnits } from "@/lib/data";

export async function GET() {
  try {
    const { data, source } = await fetchUnits();
    return NextResponse.json({ units: data, source });
  } catch (error: any) {
    return NextResponse.json(
      { error: error.message || "Failed to fetch units" },
      { status: 500 }
    );
  }
}
