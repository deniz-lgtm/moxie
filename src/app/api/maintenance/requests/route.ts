import { NextRequest, NextResponse } from "next/server";
import {
  getStoredWorkOrders,
  getLastSyncTime,
  getAllAnnotations,
} from "@/lib/work-orders-db";
import { mapWorkOrderRow, getPortfolioPropertyIds } from "@/lib/data";
import type {
  MaintenanceCategory,
  MaintenancePriority,
  MaintenanceRequest,
  MaintenanceStatus,
} from "@/lib/types";
import type { DbWorkOrderAnnotation } from "@/lib/supabase";

// The Supabase work_orders table is shared across portfolios in theory,
// but in practice only the Moxie portfolio (24) syncs to it. Default
// the read path to portfolio 24 unless the caller asks otherwise. This
// guards against legacy rows from other portfolios polluting counts on
// /maintenance.
const DEFAULT_PORTFOLIO_ID = "24";

const VALID_CATEGORIES: ReadonlySet<string> = new Set([
  "plumbing",
  "electrical",
  "hvac",
  "appliance",
  "structural",
  "pest",
  "locksmith",
  "general",
]);
const VALID_PRIORITIES: ReadonlySet<string> = new Set([
  "emergency",
  "high",
  "medium",
  "low",
]);

function applyAnnotation(
  req: MaintenanceRequest,
  ann: DbWorkOrderAnnotation | undefined
): MaintenanceRequest {
  if (!ann) return req;
  // AppFolio status_notes come first, then Moxie-added notes in chronological order.
  const moxieNotes = (ann.notes || []).map((n) => n.text).filter(Boolean);
  const aiCategory =
    ann.ai_category && VALID_CATEGORIES.has(ann.ai_category)
      ? (ann.ai_category as MaintenanceCategory)
      : undefined;
  const aiPriority =
    ann.ai_priority && VALID_PRIORITIES.has(ann.ai_priority)
      ? (ann.ai_priority as MaintenancePriority)
      : undefined;
  return {
    ...req,
    status: ann.internal_status ? (ann.internal_status as MaintenanceStatus) : req.status,
    assignedTo: ann.assigned_to_override ?? req.assignedTo,
    vendor: ann.vendor_override ?? req.vendor,
    scheduledDate: ann.scheduled_date_override ?? req.scheduledDate,
    followUpOn: ann.follow_up_on ?? req.followUpOn,
    notes: [...req.notes, ...moxieNotes],
    aiCategory,
    aiPriority,
    aiTitle: ann.ai_title ?? undefined,
    aiClassifiedAt: ann.ai_classified_at ?? undefined,
  };
}

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const portfolioId = searchParams.get("portfolio_id") ?? DEFAULT_PORTFOLIO_ID;

    const [stored, annotations, syncedAt, portfolioPropertyIds] = await Promise.all([
      getStoredWorkOrders({
        property_id: searchParams.get("property_id") || undefined,
        status: searchParams.get("status") || undefined,
      }),
      getAllAnnotations(),
      getLastSyncTime(),
      getPortfolioPropertyIds(portfolioId),
    ]);

    // Drop any stored row whose property isn't in the requested portfolio.
    // The reconcile pass at sync time only flips IN-portfolio rows to
    // closed; phantom rows from other portfolios would otherwise stay
    // counted as open forever.
    const inPortfolio = stored.filter((row) => {
      const propId = row.property_id ? String(row.property_id) : "";
      return propId.length > 0 && portfolioPropertyIds.has(propId);
    });
    const filteredOut = stored.length - inPortfolio.length;
    if (filteredOut > 0) {
      console.log(
        `[Moxie] /api/maintenance/requests: filtered out ${filteredOut} stored rows ` +
          `not in portfolio ${portfolioId} (kept ${inPortfolio.length}/${stored.length})`
      );
    }

    const workOrders = inPortfolio.map((row, i) => {
      // Make the table's `status` column authoritative over the snapshot
      // in `raw.status`. The reconcile pass at sync time writes only to
      // the column; without this merge the page would keep mapping rows
      // off the original AppFolio raw status forever.
      const rawWithLatestStatus = {
        ...((row.raw as Record<string, any>) || {}),
        status: row.status ?? (row.raw as Record<string, any> | null)?.status,
      };
      const base = mapWorkOrderRow(rawWithLatestStatus, i);
      return applyAnnotation(base, annotations.get(base.id));
    });

    return NextResponse.json({
      workOrders,
      source: "supabase" as const,
      syncedAt,
      count: workOrders.length,
      portfolioId,
      filteredOut,
    });
  } catch (error: any) {
    return NextResponse.json(
      { error: error.message || "Failed to fetch work orders" },
      { status: 500 }
    );
  }
}
