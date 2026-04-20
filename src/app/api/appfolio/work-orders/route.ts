import { NextRequest, NextResponse } from "next/server";
import { fetchMaintenanceRequests } from "@/lib/data";
import { getWorkOrders } from "@/lib/appfolio";

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const debug = searchParams.get("debug") === "1";
    const { data, source } = await fetchMaintenanceRequests({
      property_id: searchParams.get("property_id") || undefined,
      status: searchParams.get("status") || undefined,
    });
    if (debug) {
      const raw = await getWorkOrders({
        property_id: searchParams.get("property_id") || undefined,
        status: searchParams.get("status") || undefined,
      });
      return NextResponse.json({
        workOrders: data,
        source,
        debug: {
          rawCount: raw?.length ?? 0,
          sampleFields: raw?.[0] ? Object.keys(raw[0]) : [],
          sampleRow: raw?.[0] ?? null,
          filteredCount: data.length,
        },
      });
    }
    return NextResponse.json({ workOrders: data, source });
  } catch (error: any) {
    return NextResponse.json(
      { error: error.message || "Failed to fetch work orders" },
      { status: 500 }
    );
  }
}
