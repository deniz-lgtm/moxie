// ============================================
// Work Orders DB — Supabase-backed snapshot of AppFolio work orders
// ============================================
// The sync endpoint (POST /api/maintenance/sync) fetches work orders
// from AppFolio, filters to the Moxie portfolio, and upserts here.
// The read endpoint (GET /api/maintenance/requests) reads from here.
// No localStorage fallback — work orders are server-only data; we just
// return an empty array if Supabase isn't configured or the table is
// missing (the UI surfaces the empty state + prompts a sync).

import {
  getSupabase,
  type DbWorkOrder,
  type DbWorkOrderAnnotation,
  type DbWorkOrderNote,
} from "./supabase";

/** Convert a raw AppFolio `work_order` row to a `work_orders` table row. */
function rawToDbRow(raw: Record<string, any>): Omit<DbWorkOrder, "created_at" | "updated_at"> | null {
  const id = raw.work_order_id != null
    ? String(raw.work_order_id)
    : raw.work_order_number != null
      ? String(raw.work_order_number)
      : "";
  if (!id) return null;
  const numOrNull = (v: unknown): number | null => {
    if (v == null || v === "") return null;
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  };
  const strOrNull = (v: unknown): string | null => {
    if (v == null || v === "") return null;
    return String(v);
  };
  return {
    id,
    work_order_number: strOrNull(raw.work_order_number),
    service_request_number: strOrNull(raw.service_request_number),
    property_id: strOrNull(raw.property_id),
    property_name: strOrNull(raw.property_name),
    unit_id: strOrNull(raw.unit_id),
    unit_name: strOrNull(raw.unit_name),
    primary_tenant: strOrNull(raw.primary_tenant),
    primary_tenant_email: strOrNull(raw.primary_tenant_email),
    primary_tenant_phone_number: strOrNull(raw.primary_tenant_phone_number),
    work_order_type: strOrNull(raw.work_order_type),
    priority: strOrNull(raw.priority),
    status: strOrNull(raw.status),
    job_description: strOrNull(raw.job_description),
    service_request_description: strOrNull(raw.service_request_description),
    instructions: strOrNull(raw.instructions),
    vendor: strOrNull(raw.vendor),
    vendor_id: strOrNull(raw.vendor_id),
    assigned_user: strOrNull(raw.assigned_user),
    estimate_amount: numOrNull(raw.estimate_amount),
    amount: numOrNull(raw.amount),
    scheduled_start: strOrNull(raw.scheduled_start),
    scheduled_end: strOrNull(raw.scheduled_end),
    completed_on: strOrNull(raw.completed_on),
    work_completed_on: strOrNull(raw.work_completed_on),
    appfolio_created_at: strOrNull(raw.created_at),
    status_notes: strOrNull(raw.status_notes),
    raw,
    synced_at: new Date().toISOString(),
  };
}

/** Upsert raw AppFolio rows into Supabase. Returns how many rows were written. */
export async function upsertWorkOrders(rawRows: Record<string, any>[]): Promise<number> {
  const sb = getSupabase();
  if (!sb) throw new Error("Supabase not configured");

  const rows = rawRows.map(rawToDbRow).filter((r): r is NonNullable<typeof r> => r !== null);
  if (rows.length === 0) return 0;

  // Chunked upsert — keeps the request under Supabase's payload cap on
  // large portfolios. 200 rows/batch is well under 1MB for these shapes.
  let total = 0;
  for (let i = 0; i < rows.length; i += 200) {
    const batch = rows.slice(i, i + 200);
    const { error } = await sb.from("work_orders").upsert(batch, { onConflict: "id" });
    if (error) throw new Error(`[work-orders-db] upsert failed: ${error.message}`);
    total += batch.length;
  }
  return total;
}

/** Fetch all stored work orders, newest-first by AppFolio created_at. */
export async function getStoredWorkOrders(filters?: {
  property_id?: string;
  status?: string;
}): Promise<DbWorkOrder[]> {
  const sb = getSupabase();
  if (!sb) return [];

  let query = sb.from("work_orders").select("*").order("appfolio_created_at", { ascending: false, nullsFirst: false });
  if (filters?.property_id) query = query.eq("property_id", filters.property_id);
  if (filters?.status) query = query.eq("status", filters.status);

  const { data, error } = await query;
  if (error) {
    if (!isMissingTableError(error)) {
      console.warn("[work-orders-db] getStoredWorkOrders:", error.message);
    }
    return [];
  }
  return (data ?? []) as DbWorkOrder[];
}

/** Most recent synced_at across all stored rows, or null if the table is empty/missing. */
export async function getLastSyncTime(): Promise<string | null> {
  const sb = getSupabase();
  if (!sb) return null;

  const { data, error } = await sb
    .from("work_orders")
    .select("synced_at")
    .order("synced_at", { ascending: false })
    .limit(1);

  if (error) {
    if (!isMissingTableError(error)) {
      console.warn("[work-orders-db] getLastSyncTime:", error.message);
    }
    return null;
  }
  return data?.[0]?.synced_at ?? null;
}

/** Fetch all Moxie annotations, keyed by work_order id. */
export async function getAllAnnotations(): Promise<Map<string, DbWorkOrderAnnotation>> {
  const sb = getSupabase();
  const map = new Map<string, DbWorkOrderAnnotation>();
  if (!sb) return map;

  const { data, error } = await sb.from("work_order_annotations").select("*");
  if (error) {
    if (!isMissingTableError(error)) {
      console.warn("[work-orders-db] getAllAnnotations:", error.message);
    }
    return map;
  }
  for (const row of (data ?? []) as DbWorkOrderAnnotation[]) {
    map.set(row.id, row);
  }
  return map;
}

/** Read one annotation by id (null if none). */
export async function getAnnotation(id: string): Promise<DbWorkOrderAnnotation | null> {
  const sb = getSupabase();
  if (!sb) return null;
  const { data, error } = await sb
    .from("work_order_annotations")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (error) {
    if (!isMissingTableError(error)) {
      console.warn("[work-orders-db] getAnnotation:", error.message);
    }
    return null;
  }
  return (data as DbWorkOrderAnnotation) ?? null;
}

export type AnnotationUpdate = {
  internal_status?: string | null;
  assigned_to_override?: string | null;
  vendor_override?: string | null;
  scheduled_date_override?: string | null;
  tags?: string[];
  follow_up_on?: string | null;
};

/**
 * Upsert an annotation for a work order. Merges `update` fields with any
 * existing row and appends `appendNote` to the notes array (newest last).
 * Creates the row on first touch.
 */
export async function saveAnnotation(
  id: string,
  update: AnnotationUpdate = {},
  appendNote?: { text: string; author?: string }
): Promise<DbWorkOrderAnnotation> {
  const sb = getSupabase();
  if (!sb) throw new Error("Supabase not configured");

  const existing = await getAnnotation(id);
  const now = new Date().toISOString();
  const nextNotes: DbWorkOrderNote[] = existing?.notes ? [...existing.notes] : [];
  if (appendNote?.text) {
    nextNotes.push({
      text: appendNote.text,
      created_at: now,
      ...(appendNote.author ? { author: appendNote.author } : {}),
    });
  }

  const row: Omit<DbWorkOrderAnnotation, "created_at" | "updated_at"> = {
    id,
    notes: nextNotes,
    internal_status: update.internal_status ?? existing?.internal_status ?? null,
    assigned_to_override: update.assigned_to_override ?? existing?.assigned_to_override ?? null,
    vendor_override: update.vendor_override ?? existing?.vendor_override ?? null,
    scheduled_date_override: update.scheduled_date_override ?? existing?.scheduled_date_override ?? null,
    tags: update.tags ?? existing?.tags ?? [],
    follow_up_on: update.follow_up_on ?? existing?.follow_up_on ?? null,
  };

  const { data, error } = await sb
    .from("work_order_annotations")
    .upsert(row, { onConflict: "id" })
    .select("*")
    .single();
  if (error) throw new Error(`[work-orders-db] saveAnnotation: ${error.message}`);
  return data as DbWorkOrderAnnotation;
}

function isMissingTableError(error: { code?: string; message?: string } | null | undefined): boolean {
  if (!error) return false;
  if (error.code === "42P01") return true;
  if (error.code === "PGRST205") return true;
  const msg = error.message || "";
  return /does not exist|not found in schema|relation .* does not exist/i.test(msg);
}
