import { NextResponse } from "next/server";
import { fetchProperties } from "@/lib/data";

export async function GET() {
  try {
    const { data, source } = await fetchProperties();
    return NextResponse.json({ properties: data, source });
  } catch (error: any) {
    return NextResponse.json(
      { error: error.message || "Failed to fetch properties" },
      { status: 500 }
    );
  }
}
