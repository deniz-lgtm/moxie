import { NextRequest, NextResponse } from "next/server";
import { getStoredWorkOrders, getLastSyncTime } from "@/lib/work-orders-db";
import { mapWorkOrderRow } from "@/lib/data";

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const stored = await getStoredWorkOrders({
      property_id: searchParams.get("property_id") || undefined,
      status: searchParams.get("status") || undefined,
    });
    const syncedAt = await getLastSyncTime();
    const workOrders = stored.map((row, i) =>
      mapWorkOrderRow((row.raw as Record<string, any>) || {}, i)
    );
    return NextResponse.json({
      workOrders,
      source: "supabase" as const,
      syncedAt,
      count: workOrders.length,
    });
  } catch (error: any) {
    return NextResponse.json(
      { error: error.message || "Failed to fetch work orders" },
      { status: 500 }
    );
  }
}
