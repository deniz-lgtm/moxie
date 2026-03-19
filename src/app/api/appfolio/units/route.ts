import { NextResponse } from "next/server";
import { fetchUnits, debugMoxieFilter } from "@/lib/data";

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    // Add ?debug=1 to see cross-reference diagnostics
    if (url.searchParams.get("debug")) {
      const diag = await debugMoxieFilter();
      return NextResponse.json(diag);
    }
    const { data, source } = await fetchUnits();
    return NextResponse.json({ units: data, source });
  } catch (error: any) {
    return NextResponse.json(
      { error: error.message || "Failed to fetch units" },
      { status: 500 }
    );
  }
}
