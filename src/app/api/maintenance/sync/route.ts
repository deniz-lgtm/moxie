import { NextResponse } from "next/server";
import { fetchMoxieWorkOrderRows } from "@/lib/data";
import { upsertWorkOrders, getLastSyncTime } from "@/lib/work-orders-db";

export async function POST() {
  try {
    const rows = await fetchMoxieWorkOrderRows();
    const count = await upsertWorkOrders(rows);
    const syncedAt = await getLastSyncTime();
    return NextResponse.json({ ok: true, count, syncedAt });
  } catch (error: any) {
    return NextResponse.json(
      { error: error.message || "Sync failed" },
      { status: 500 }
    );
  }
}

export async function GET() {
  try {
    const syncedAt = await getLastSyncTime();
    return NextResponse.json({ syncedAt });
  } catch (error: any) {
    return NextResponse.json(
      { error: error.message || "Failed to read sync status" },
      { status: 500 }
    );
  }
}
