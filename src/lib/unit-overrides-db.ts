// ============================================
// Unit Overrides DB — Moxie overlay per AppFolio unit
// ============================================
// AppFolio is the source of truth for the unit list, but the team
// needs to patch some fields locally — display names that are wrong
// in AppFolio, internal notes, and arbitrary custom fields ("parking
// spot", "furnished?", etc.). Keyed by AppFolio unit_id so the
// /leasing/units page can join 1:1 with the live unit list.

import { getSupabase, type DbUnitOverride } from "./supabase";

export type UnitOverride = {
  appfolioUnitId: string;
  displayName: string | null;
  notes: string | null;
  customFields: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
};

function dbToOverride(row: DbUnitOverride): UnitOverride {
  return {
    appfolioUnitId: row.appfolio_unit_id,
    displayName: row.display_name,
    notes: row.notes,
    customFields: (row.custom_fields ?? {}) as Record<string, unknown>,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function isMissingTableError(error: { code?: string; message?: string } | null | undefined): boolean {
  if (!error) return false;
  if (error.code === "42P01" || error.code === "PGRST205") return true;
  return /does not exist|not found in schema|relation .* does not exist/i.test(
    error.message || ""
  );
}

export async function listUnitOverrides(): Promise<UnitOverride[]> {
  const sb = getSupabase();
  if (!sb) return [];
  const { data, error } = await sb.from("unit_overrides").select("*");
  if (error) {
    if (!isMissingTableError(error)) {
      console.warn("[unit-overrides-db] list:", error.message);
    }
    return [];
  }
  return (data ?? []).map((r) => dbToOverride(r as DbUnitOverride));
}

export async function getUnitOverride(appfolioUnitId: string): Promise<UnitOverride | null> {
  const sb = getSupabase();
  if (!sb) return null;
  const { data, error } = await sb
    .from("unit_overrides")
    .select("*")
    .eq("appfolio_unit_id", appfolioUnitId)
    .maybeSingle();
  if (error) {
    if (!isMissingTableError(error)) {
      console.warn("[unit-overrides-db] get:", error.message);
    }
    return null;
  }
  return data ? dbToOverride(data as DbUnitOverride) : null;
}

export type UpsertUnitOverrideInput = {
  appfolioUnitId: string;
  displayName?: string | null;
  notes?: string | null;
  customFields?: Record<string, unknown>;
};

export async function upsertUnitOverride(
  input: UpsertUnitOverrideInput
): Promise<UnitOverride> {
  const sb = getSupabase();
  if (!sb) throw new Error("Supabase not configured");
  const row: Partial<DbUnitOverride> & { appfolio_unit_id: string } = {
    appfolio_unit_id: input.appfolioUnitId,
  };
  if ("displayName" in input) row.display_name = input.displayName ?? null;
  if ("notes" in input) row.notes = input.notes ?? null;
  if ("customFields" in input) row.custom_fields = input.customFields ?? {};
  const { data, error } = await sb
    .from("unit_overrides")
    .upsert(row, { onConflict: "appfolio_unit_id" })
    .select("*")
    .single();
  if (error) throw new Error(`[unit-overrides-db] upsert: ${error.message}`);
  return dbToOverride(data as DbUnitOverride);
}

export async function deleteUnitOverride(appfolioUnitId: string): Promise<void> {
  const sb = getSupabase();
  if (!sb) throw new Error("Supabase not configured");
  const { error } = await sb
    .from("unit_overrides")
    .delete()
    .eq("appfolio_unit_id", appfolioUnitId);
  if (error) throw new Error(`[unit-overrides-db] delete: ${error.message}`);
}
