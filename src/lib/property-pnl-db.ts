// ============================================
// Property P&L Line Items — Supabase-backed
// ============================================
// Monthly opex + supplementary-income entries per property. One row
// per (property, month, category). Rent comes from the rent roll;
// this table is everything AppFolio doesn't give us a clean feed for.

import { getSupabase, type DbPropertyPnlLineItem } from "./supabase";
import type { PropertyPnlLineItem } from "./types";

function dbToLineItem(row: DbPropertyPnlLineItem): PropertyPnlLineItem {
  return {
    id: row.id,
    propertyId: row.property_id,
    month: row.month,
    category: row.category,
    amount: Number(row.amount ?? 0),
    notes: row.notes ?? undefined,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function lineItemToDb(
  i: PropertyPnlLineItem
): Omit<DbPropertyPnlLineItem, "created_at" | "updated_at"> {
  return {
    id: i.id,
    property_id: i.propertyId,
    month: i.month,
    category: i.category,
    amount: i.amount,
    notes: i.notes ?? null,
  };
}

function isMissingTableError(error: { code?: string; message?: string } | null | undefined): boolean {
  if (!error) return false;
  if (error.code === "42P01") return true;
  if (error.code === "PGRST205") return true;
  return /does not exist|not found in schema|relation .* does not exist/i.test(error.message || "");
}

/**
 * List line items. Filter by any combination of property_id, exact
 * month (YYYY-MM-01), or month range [monthFrom, monthTo].
 */
export async function listPnlLineItems(opts?: {
  propertyId?: string;
  month?: string;
  monthFrom?: string;
  monthTo?: string;
}): Promise<PropertyPnlLineItem[]> {
  const sb = getSupabase();
  if (!sb) return [];
  let query = sb
    .from("property_pnl_line_items")
    .select("*")
    .order("month", { ascending: false })
    .order("category");
  if (opts?.propertyId) query = query.eq("property_id", opts.propertyId);
  if (opts?.month) query = query.eq("month", opts.month);
  if (opts?.monthFrom) query = query.gte("month", opts.monthFrom);
  if (opts?.monthTo) query = query.lte("month", opts.monthTo);
  const { data, error } = await query;
  if (error) {
    if (!isMissingTableError(error)) console.warn("[pnl-db] list:", error.message);
    return [];
  }
  return (data ?? []).map(dbToLineItem);
}

/** Upsert (insert-or-update) by (property_id, month, category). */
export async function upsertPnlLineItem(
  i: PropertyPnlLineItem
): Promise<PropertyPnlLineItem> {
  const sb = getSupabase();
  if (!sb) throw new Error("Supabase not configured");
  const { data, error } = await sb
    .from("property_pnl_line_items")
    .upsert(lineItemToDb(i), { onConflict: "property_id,month,category" })
    .select("*")
    .single();
  if (error) throw new Error(`[pnl-db] upsert: ${error.message}`);
  return dbToLineItem(data as DbPropertyPnlLineItem);
}

export async function deletePnlLineItem(id: string): Promise<void> {
  const sb = getSupabase();
  if (!sb) throw new Error("Supabase not configured");
  const { error } = await sb.from("property_pnl_line_items").delete().eq("id", id);
  if (error) throw new Error(`[pnl-db] delete: ${error.message}`);
}
