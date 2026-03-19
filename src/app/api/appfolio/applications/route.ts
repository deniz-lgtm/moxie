import { NextResponse } from "next/server";
import { fetchApplications } from "@/lib/data";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const { data, source } = await fetchApplications();
    return NextResponse.json({ applications: data, source });
  } catch (error: any) {
    return NextResponse.json(
      { error: error.message || "Failed to fetch applications", stack: error.stack?.split("\n").slice(0, 5) },
      { status: 500 }
    );
  }
}
