// ============================================
// Vendors DB — Supabase-backed vendor directory
// ============================================
// Moxie-side source of truth. When Notion sync is configured, rows
// carry `notion_page_id` + `notion_last_synced_at` for reconciliation.

import { getSupabase, type DbVendor } from "./supabase";
import type { Vendor, VendorStatus } from "./types";

function dbToVendor(row: DbVendor): Vendor {
  return {
    id: row.id,
    name: row.name,
    category: row.category ?? undefined,
    phone: row.phone ?? undefined,
    email: row.email ?? undefined,
    website: row.website ?? undefined,
    address: row.address ?? undefined,
    contactName: row.contact_name ?? undefined,
    licenseNumber: row.license_number ?? undefined,
    insuranceExpiry: row.insurance_expiry ?? undefined,
    status: (row.status ?? undefined) as VendorStatus | undefined,
    rating: row.rating ?? undefined,
    notes: row.notes ?? undefined,
    isInternal: row.is_internal,
    notionPageId: row.notion_page_id ?? undefined,
    notionLastSyncedAt: row.notion_last_synced_at ?? undefined,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function vendorToDb(v: Vendor): Omit<DbVendor, "created_at" | "updated_at"> {
  return {
    id: v.id,
    name: v.name,
    category: v.category ?? null,
    phone: v.phone ?? null,
    email: v.email ?? null,
    website: v.website ?? null,
    address: v.address ?? null,
    contact_name: v.contactName ?? null,
    license_number: v.licenseNumber ?? null,
    insurance_expiry: v.insuranceExpiry ?? null,
    status: v.status ?? null,
    rating: v.rating ?? null,
    notes: v.notes ?? null,
    is_internal: v.isInternal,
    notion_page_id: v.notionPageId ?? null,
    notion_last_synced_at: v.notionLastSyncedAt ?? null,
    raw: {},
  };
}

export async function listVendors(): Promise<Vendor[]> {
  const sb = getSupabase();
  if (!sb) return [];
  const { data, error } = await sb.from("vendors").select("*").order("name");
  if (error) {
    if (!isMissingTableError(error)) console.warn("[vendors-db] list:", error.message);
    return [];
  }
  return (data ?? []).map(dbToVendor);
}

export async function getVendorById(id: string): Promise<Vendor | null> {
  const sb = getSupabase();
  if (!sb) return null;
  const { data, error } = await sb.from("vendors").select("*").eq("id", id).maybeSingle();
  if (error || !data) return null;
  return dbToVendor(data);
}

export async function upsertVendor(v: Vendor): Promise<Vendor> {
  const sb = getSupabase();
  if (!sb) throw new Error("Supabase not configured");
  const { data, error } = await sb
    .from("vendors")
    .upsert(vendorToDb(v), { onConflict: "id" })
    .select("*")
    .single();
  if (error) throw new Error(`[vendors-db] upsert: ${error.message}`);
  return dbToVendor(data);
}

/** Raw upsert for sync flow — bypasses the Vendor type so we can include the `raw` Notion payload. */
export async function upsertVendorRows(
  rows: Array<Omit<DbVendor, "created_at" | "updated_at">>
): Promise<number> {
  const sb = getSupabase();
  if (!sb) throw new Error("Supabase not configured");
  if (rows.length === 0) return 0;
  let total = 0;
  for (let i = 0; i < rows.length; i += 200) {
    const batch = rows.slice(i, i + 200);
    const { error } = await sb.from("vendors").upsert(batch, { onConflict: "id" });
    if (error) throw new Error(`[vendors-db] upsert rows: ${error.message}`);
    total += batch.length;
  }
  return total;
}

export async function deleteVendor(id: string): Promise<void> {
  const sb = getSupabase();
  if (!sb) throw new Error("Supabase not configured");
  const { error } = await sb.from("vendors").delete().eq("id", id);
  if (error) throw new Error(`[vendors-db] delete: ${error.message}`);
}

export async function getLastVendorSyncTime(): Promise<string | null> {
  const sb = getSupabase();
  if (!sb) return null;
  const { data, error } = await sb
    .from("vendors")
    .select("notion_last_synced_at")
    .order("notion_last_synced_at", { ascending: false })
    .limit(1);
  if (error) return null;
  return data?.[0]?.notion_last_synced_at ?? null;
}

function isMissingTableError(error: { code?: string; message?: string } | null | undefined): boolean {
  if (!error) return false;
  if (error.code === "42P01") return true;
  if (error.code === "PGRST205") return true;
  const msg = error.message || "";
  return /does not exist|not found in schema|relation .* does not exist/i.test(msg);
}
