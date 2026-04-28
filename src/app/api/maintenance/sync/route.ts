import { NextResponse } from "next/server";
import { fetchMoxieWorkOrderRows, getPortfolioPropertyIds } from "@/lib/data";
import {
  upsertWorkOrders,
  reconcileClosedWorkOrders,
  getLastSyncTime,
} from "@/lib/work-orders-db";

const MOXIE_PORTFOLIO_ID = "24";

export async function POST() {
  try {
    const rows = await fetchMoxieWorkOrderRows();
    const count = await upsertWorkOrders(rows);

    // Reconcile: any stored row whose property is in our portfolio but
    // didn't come back from AppFolio is treated as closed. Without this
    // step the snapshot keeps showing rows as "open" forever after
    // they're completed in AppFolio or fall outside the report window.
    const liveIds = new Set(
      rows
        .map((r) =>
          r.work_order_id != null
            ? String(r.work_order_id)
            : r.work_order_number != null
            ? String(r.work_order_number)
            : ""
        )
        .filter((id) => id.length > 0)
    );
    const portfolioPropertyIds = await getPortfolioPropertyIds(MOXIE_PORTFOLIO_ID);
    const closedCount = await reconcileClosedWorkOrders(liveIds, portfolioPropertyIds);

    const syncedAt = await getLastSyncTime();
    return NextResponse.json({ ok: true, count, closedCount, syncedAt });
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
