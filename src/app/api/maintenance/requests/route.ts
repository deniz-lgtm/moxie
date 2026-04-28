import { NextRequest, NextResponse } from "next/server";
import {
  getStoredWorkOrders,
  getLastSyncTime,
  getAllAnnotations,
} from "@/lib/work-orders-db";
import { mapWorkOrderRow } from "@/lib/data";
import type {
  MaintenanceCategory,
  MaintenancePriority,
  MaintenanceRequest,
  MaintenanceStatus,
} from "@/lib/types";
import type { DbWorkOrderAnnotation } from "@/lib/supabase";

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
    const [stored, annotations, syncedAt] = await Promise.all([
      getStoredWorkOrders({
        property_id: searchParams.get("property_id") || undefined,
        status: searchParams.get("status") || undefined,
      }),
      getAllAnnotations(),
      getLastSyncTime(),
    ]);

    const workOrders = stored.map((row, i) => {
      const base = mapWorkOrderRow((row.raw as Record<string, any>) || {}, i);
      return applyAnnotation(base, annotations.get(base.id));
    });

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
