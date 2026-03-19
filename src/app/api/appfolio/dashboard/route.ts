import { NextResponse } from "next/server";
import { fetchDashboardStats } from "@/lib/data";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const { data, source } = await fetchDashboardStats();
    return NextResponse.json({ stats: data, source });
  } catch (error: any) {
    return NextResponse.json(
      { error: error.message || "Failed to fetch dashboard stats", stack: error.stack?.split("\n").slice(0, 5) },
      { status: 500 }
    );
  }
}
