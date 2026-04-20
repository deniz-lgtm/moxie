// ============================================
// RUBS Data Layer — Supabase primary, localStorage fallback
// ============================================
// All storage functions are async. If Supabase is configured
// (NEXT_PUBLIC_SUPABASE_URL + NEXT_PUBLIC_SUPABASE_ANON_KEY) the
// data lives in Postgres and is shared across browsers/users. If
// Supabase isn't configured (or the tables don't exist yet), the
// functions transparently fall back to localStorage so the app
// keeps working.
//
// SQL to create the tables: supabase/migrations/20260408_rubs_tables.sql

import { loadFromStorage, saveToStorage } from "./storage";
import { getSupabase, isSupabaseConfigured } from "./supabase";
import type {
  DbMeterMapping,
  DbRubsBill,
  DbOccupancy,
  DbPropertyAlias,
} from "./supabase";
import type {
  MeterMapping,
  RubsBill,
  OccupancyData,
  PropertyAlias,
  RubsAllocation,
} from "./rubs-types";

const MAPPINGS_KEY = "rubs_mappings";
const BILLS_KEY = "rubs_bills";
const OCCUPANCY_KEY = "rubs_occupancy";
const ALIASES_KEY = "rubs_property_aliases";
const MIGRATION_DONE_KEY = "rubs_supabase_migrated";

// ─── Conversion helpers ────────────────────────────────────────

function mappingToDb(m: MeterMapping): Omit<DbMeterMapping, "created_at" | "updated_at"> {
  return {
    id: m.id,
    property_name: m.propertyName,
    meter_type: m.meterType,
    metering_method: m.meteringMethod,
    meter_id: m.meterId,
    unit_ids: m.unitIds,
    split_method: m.splitMethod,
    custom_shares: m.customShares || null,
  };
}

function mappingFromDb(row: DbMeterMapping): MeterMapping {
  return {
    id: row.id,
    propertyName: row.property_name,
    meterType: row.meter_type,
    meteringMethod: row.metering_method,
    meterId: row.meter_id,
    unitIds: row.unit_ids || [],
    splitMethod: row.split_method,
    customShares: row.custom_shares || undefined,
  };
}

function billToDb(b: RubsBill): Omit<DbRubsBill, "created_at" | "updated_at"> {
  return {
    id: b.id,
    property_name: b.propertyName,
    month: b.month,
    meter_type: b.meterType,
    total_amount: b.totalAmount,
    mapping_id: b.mappingId,
    status: b.status,
    allocations: b.allocations as RubsAllocation[],
    source_file: b.sourceFile || null,
  };
}

function billFromDb(row: DbRubsBill): RubsBill {
  return {
    id: row.id,
    propertyName: row.property_name,
    month: row.month,
    meterType: row.meter_type,
    totalAmount: Number(row.total_amount),
    mappingId: row.mapping_id,
    status: row.status,
    allocations: (row.allocations || []) as RubsAllocation[],
    sourceFile: row.source_file || undefined,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function aliasToDb(a: PropertyAlias): Omit<DbPropertyAlias, "created_at"> {
  return {
    id: a.id,
    canonical_name: a.canonicalName,
    aliases: a.aliases,
    notes: a.notes || null,
  };
}

function aliasFromDb(row: DbPropertyAlias): PropertyAlias {
  return {
    id: row.id,
    canonicalName: row.canonical_name,
    aliases: row.aliases || [],
    notes: row.notes || undefined,
  };
}

// ─── Meter Mappings ────────────────────────────────────────────

export async function getMeterMappings(): Promise<MeterMapping[]> {
  const sb = getSupabase();
  if (sb) {
    const { data, error } = await sb.from("rubs_meter_mappings").select("*");
    if (!error) return (data || []).map(mappingFromDb);
    // Table may not exist yet — fall through to localStorage
    if (!isMissingTableError(error)) console.warn("[rubs-db] getMeterMappings:", error.message);
  }
  return loadFromStorage<MeterMapping[]>(MAPPINGS_KEY, []);
}

export async function getMeterMappingById(id: string): Promise<MeterMapping | undefined> {
  const all = await getMeterMappings();
  return all.find((m) => m.id === id);
}

export async function saveMeterMapping(mapping: MeterMapping): Promise<void> {
  const sb = getSupabase();
  if (sb) {
    const { error } = await sb.from("rubs_meter_mappings").upsert(mappingToDb(mapping), { onConflict: "id" });
    if (!error) {
      // Also update localStorage cache so UI refresh doesn't lose data on offline
      upsertLocal<MeterMapping>(MAPPINGS_KEY, mapping, "id");
      return;
    }
    if (!isMissingTableError(error)) console.warn("[rubs-db] saveMeterMapping:", error.message);
  }
  upsertLocal<MeterMapping>(MAPPINGS_KEY, mapping, "id");
}

export async function deleteMeterMapping(id: string): Promise<void> {
  const sb = getSupabase();
  if (sb) {
    const { error } = await sb.from("rubs_meter_mappings").delete().eq("id", id);
    if (!error) {
      removeLocal<MeterMapping>(MAPPINGS_KEY, id, "id");
      return;
    }
    if (!isMissingTableError(error)) console.warn("[rubs-db] deleteMeterMapping:", error.message);
  }
  removeLocal<MeterMapping>(MAPPINGS_KEY, id, "id");
}

// ─── Bills ─────────────────────────────────────────────────────

export async function getBills(): Promise<RubsBill[]> {
  const sb = getSupabase();
  if (sb) {
    const { data, error } = await sb.from("rubs_bills").select("*").order("created_at", { ascending: false });
    if (!error) return (data || []).map(billFromDb);
    if (!isMissingTableError(error)) console.warn("[rubs-db] getBills:", error.message);
  }
  return loadFromStorage<RubsBill[]>(BILLS_KEY, []);
}

export async function getBillById(id: string): Promise<RubsBill | undefined> {
  const all = await getBills();
  return all.find((b) => b.id === id);
}

export async function getBillsFiltered(filters?: { month?: string; propertyName?: string }): Promise<RubsBill[]> {
  let bills = await getBills();
  if (filters?.month) bills = bills.filter((b) => b.month === filters.month);
  if (filters?.propertyName) bills = bills.filter((b) => b.propertyName === filters.propertyName);
  return bills;
}

export async function saveBill(bill: RubsBill): Promise<void> {
  const withTimestamp = { ...bill, updatedAt: new Date().toISOString() };
  const sb = getSupabase();
  if (sb) {
    const { error } = await sb.from("rubs_bills").upsert(billToDb(withTimestamp), { onConflict: "id" });
    if (!error) {
      upsertLocal<RubsBill>(BILLS_KEY, withTimestamp, "id");
      return;
    }
    if (!isMissingTableError(error)) console.warn("[rubs-db] saveBill:", error.message);
  }
  upsertLocal<RubsBill>(BILLS_KEY, withTimestamp, "id");
}

export async function deleteBill(id: string): Promise<void> {
  const sb = getSupabase();
  if (sb) {
    const { error } = await sb.from("rubs_bills").delete().eq("id", id);
    if (!error) {
      removeLocal<RubsBill>(BILLS_KEY, id, "id");
      return;
    }
    if (!isMissingTableError(error)) console.warn("[rubs-db] deleteBill:", error.message);
  }
  removeLocal<RubsBill>(BILLS_KEY, id, "id");
}

// ─── Occupancy (singleton) ─────────────────────────────────────

export async function getOccupancyData(): Promise<OccupancyData | null> {
  const sb = getSupabase();
  if (sb) {
    const { data, error } = await sb
      .from("rubs_occupancy")
      .select("*")
      .eq("id", "singleton")
      .maybeSingle();
    if (!error && data) {
      return {
        records: (data as DbOccupancy).records || [],
        importedAt: (data as DbOccupancy).imported_at,
        filename: (data as DbOccupancy).filename,
      };
    }
    if (error && !isMissingTableError(error)) console.warn("[rubs-db] getOccupancyData:", error.message);
    if (!error) return null; // no row yet
  }
  return loadFromStorage<OccupancyData | null>(OCCUPANCY_KEY, null);
}

export async function saveOccupancyData(data: OccupancyData): Promise<void> {
  const sb = getSupabase();
  if (sb) {
    const { error } = await sb.from("rubs_occupancy").upsert(
      {
        id: "singleton",
        records: data.records,
        imported_at: data.importedAt,
        filename: data.filename,
      },
      { onConflict: "id" }
    );
    if (!error) {
      saveToStorage(OCCUPANCY_KEY, data);
      return;
    }
    if (!isMissingTableError(error)) console.warn("[rubs-db] saveOccupancyData:", error.message);
  }
  saveToStorage(OCCUPANCY_KEY, data);
}

export async function clearOccupancyData(): Promise<void> {
  const sb = getSupabase();
  if (sb) {
    await sb.from("rubs_occupancy").delete().eq("id", "singleton");
  }
  saveToStorage(OCCUPANCY_KEY, null);
}

// ─── Property Aliases ──────────────────────────────────────────

export async function getPropertyAliases(): Promise<PropertyAlias[]> {
  const sb = getSupabase();
  if (sb) {
    const { data, error } = await sb.from("rubs_property_aliases").select("*");
    if (!error) return (data || []).map(aliasFromDb);
    if (!isMissingTableError(error)) console.warn("[rubs-db] getPropertyAliases:", error.message);
  }
  return loadFromStorage<PropertyAlias[]>(ALIASES_KEY, []);
}

export async function savePropertyAlias(alias: PropertyAlias): Promise<void> {
  const sb = getSupabase();
  if (sb) {
    const { error } = await sb.from("rubs_property_aliases").upsert(aliasToDb(alias), { onConflict: "id" });
    if (!error) {
      upsertLocal<PropertyAlias>(ALIASES_KEY, alias, "id");
      return;
    }
    if (!isMissingTableError(error)) console.warn("[rubs-db] savePropertyAlias:", error.message);
  }
  upsertLocal<PropertyAlias>(ALIASES_KEY, alias, "id");
}

export async function deletePropertyAlias(id: string): Promise<void> {
  const sb = getSupabase();
  if (sb) {
    const { error } = await sb.from("rubs_property_aliases").delete().eq("id", id);
    if (!error) {
      removeLocal<PropertyAlias>(ALIASES_KEY, id, "id");
      return;
    }
    if (!isMissingTableError(error)) console.warn("[rubs-db] deletePropertyAlias:", error.message);
  }
  removeLocal<PropertyAlias>(ALIASES_KEY, id, "id");
}

export async function clearPropertyAliases(): Promise<void> {
  const sb = getSupabase();
  if (sb) await sb.from("rubs_property_aliases").delete().neq("id", "");
  saveToStorage(ALIASES_KEY, []);
}

// ─── Seed helpers ──────────────────────────────────────────────

export async function isSeeded(): Promise<boolean> {
  return (await getMeterMappings()).length > 0;
}

export async function clearAllRubsData(): Promise<void> {
  const sb = getSupabase();
  if (sb) {
    await Promise.all([
      sb.from("rubs_meter_mappings").delete().neq("id", ""),
      sb.from("rubs_bills").delete().neq("id", ""),
      sb.from("rubs_property_aliases").delete().neq("id", ""),
    ]);
  }
  saveToStorage(MAPPINGS_KEY, []);
  saveToStorage(BILLS_KEY, []);
  saveToStorage(ALIASES_KEY, []);
}

// ─── One-time localStorage → Supabase migration ────────────────
// On first successful connection to Supabase, copy any existing
// localStorage data up so the user doesn't lose state they built
// up before enabling Supabase.

export async function migrateLocalToSupabaseIfNeeded(): Promise<{
  migrated: boolean;
  counts?: { mappings: number; bills: number; aliases: number; occupancy: boolean };
}> {
  if (typeof window === "undefined") return { migrated: false };
  if (loadFromStorage<boolean>(MIGRATION_DONE_KEY, false)) return { migrated: false };
  if (!isSupabaseConfigured()) return { migrated: false };

  const sb = getSupabase();
  if (!sb) return { migrated: false };

  const localMappings = loadFromStorage<MeterMapping[]>(MAPPINGS_KEY, []);
  const localBills = loadFromStorage<RubsBill[]>(BILLS_KEY, []);
  const localAliases = loadFromStorage<PropertyAlias[]>(ALIASES_KEY, []);
  const localOccupancy = loadFromStorage<OccupancyData | null>(OCCUPANCY_KEY, null);

  // Check if Supabase already has data — don't overwrite
  const { data: existingMappings, error: checkError } = await sb
    .from("rubs_meter_mappings")
    .select("id")
    .limit(1);

  if (checkError) {
    // Tables probably don't exist yet; user hasn't run the migration SQL.
    // Don't mark migration as done — try again next load.
    return { migrated: false };
  }

  if ((existingMappings || []).length > 0) {
    // Supabase has data — skip migration, mark done
    saveToStorage(MIGRATION_DONE_KEY, true);
    return { migrated: false };
  }

  // Push local data up to Supabase
  if (localMappings.length > 0) {
    await sb.from("rubs_meter_mappings").upsert(
      localMappings.map(mappingToDb),
      { onConflict: "id" }
    );
  }
  if (localBills.length > 0) {
    await sb.from("rubs_bills").upsert(localBills.map(billToDb), { onConflict: "id" });
  }
  if (localAliases.length > 0) {
    await sb.from("rubs_property_aliases").upsert(
      localAliases.map(aliasToDb),
      { onConflict: "id" }
    );
  }
  if (localOccupancy) {
    await sb.from("rubs_occupancy").upsert(
      {
        id: "singleton",
        records: localOccupancy.records,
        imported_at: localOccupancy.importedAt,
        filename: localOccupancy.filename,
      },
      { onConflict: "id" }
    );
  }

  saveToStorage(MIGRATION_DONE_KEY, true);
  return {
    migrated: true,
    counts: {
      mappings: localMappings.length,
      bills: localBills.length,
      aliases: localAliases.length,
      occupancy: !!localOccupancy,
    },
  };
}

// ─── Internals ─────────────────────────────────────────────────

function isMissingTableError(error: { code?: string; message?: string } | null | undefined): boolean {
  if (!error) return false;
  // Postgres 42P01 = undefined_table. Also catch "not found in schema cache"
  // strings Supabase returns when the table doesn't exist.
  if (error.code === "42P01") return true;
  if (error.code === "PGRST205") return true;
  const msg = error.message || "";
  return /does not exist|not found in schema|relation .* does not exist/i.test(msg);
}

function upsertLocal<T extends { id: string }>(key: string, item: T, _idField: "id"): void {
  const all = loadFromStorage<T[]>(key, []);
  const idx = all.findIndex((x) => x.id === item.id);
  if (idx >= 0) all[idx] = item;
  else all.push(item);
  saveToStorage(key, all);
}

function removeLocal<T extends { id: string }>(key: string, id: string, _idField: "id"): void {
  saveToStorage(key, loadFromStorage<T[]>(key, []).filter((x) => x.id !== id));
}
