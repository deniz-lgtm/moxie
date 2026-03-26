import { NextResponse } from "next/server";
import { fetchUnits, fetchUnitsWithTenants, fetchTenantsForUnit, debugMoxieFilter, fetchUnitStats } from "@/lib/data";
import type { AcademicYear } from "@/lib/types";

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    // Add ?debug=1 to see cross-reference diagnostics
    if (url.searchParams.get("debug")) {
      const diag = await debugMoxieFilter();
      return NextResponse.json(diag);
    }
    // Add ?prelease_debug=1 to see pre-lease calculation breakdown
    if (url.searchParams.get("prelease_debug")) {
      const ay = (url.searchParams.get("ay") || "2026-2027") as AcademicYear;
      const stats = await fetchUnitStats(ay);
      return NextResponse.json({
        academicYear: ay,
        totalUniqueUnits: stats.total,
        occupied: stats.occupied,
        preLeased: stats.preLeased,
        preLeasedPct: stats.total > 0 ? Math.round((stats.preLeased / stats.total) * 100) : 0,
        unleasedCount: stats.unleased.length,
        unleasedUnits: stats.unleased,
      });
    }
    // Add ?tenants_for=<unitAddress> to get tenants for a specific unit
    const tenantsFor = url.searchParams.get("tenants_for");
    if (tenantsFor) {
      const tenants = await fetchTenantsForUnit(tenantsFor);
      return NextResponse.json({ tenants });
    }
    // Add ?withTenants=1 to get units with grouped tenants and emails
    if (url.searchParams.get("withTenants")) {
      const { data, source } = await fetchUnitsWithTenants();
      return NextResponse.json({ units: data, source });
    }
    // Add ?address=<value> to find a specific unit by address
    const addressQuery = url.searchParams.get("address");
    if (addressQuery) {
      const { data, source } = await fetchUnits();
      const match = data.filter((u) =>
        u.unitName.toLowerCase().includes(addressQuery.toLowerCase()) ||
        u.id.toLowerCase().includes(addressQuery.toLowerCase())
      );
      return NextResponse.json({ query: addressQuery, matches: match.length, units: match, source });
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
