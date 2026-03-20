import { NextResponse } from "next/server";
import { fetchDashboardStats } from "@/lib/data";
import type { AcademicYear } from "@/lib/types";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const academicYear = url.searchParams.get("academicYear") as AcademicYear | null;
    const { data, source } = await fetchDashboardStats(academicYear || undefined);
    return NextResponse.json({ stats: data, source });
  } catch (error: any) {
    return NextResponse.json(
      { error: error.message || "Failed to fetch dashboard stats", stack: error.stack?.split("\n").slice(0, 5) },
      { status: 500 }
    );
  }
}
