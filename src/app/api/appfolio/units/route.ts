import { NextResponse } from "next/server";
import { fetchUnits, fetchUnitsWithTenants, debugMoxieFilter } from "@/lib/data";
import type { AcademicYear } from "@/lib/types";

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    // Add ?debug=1 to see cross-reference diagnostics
    if (url.searchParams.get("debug")) {
      const diag = await debugMoxieFilter();
      return NextResponse.json(diag);
    }
    // Add ?withTenants=1 to get units with grouped tenants and emails
    if (url.searchParams.get("withTenants")) {
      const { data, source } = await fetchUnitsWithTenants();
      return NextResponse.json({ units: data, source });
    }
    const academicYear = url.searchParams.get("academicYear") as AcademicYear | null;
    const { data, source } = await fetchUnits(academicYear || undefined);
    return NextResponse.json({ units: data, source });
  } catch (error: any) {
    return NextResponse.json(
      { error: error.message || "Failed to fetch units" },
      { status: 500 }
    );
  }
}
