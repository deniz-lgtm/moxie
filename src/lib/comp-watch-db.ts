// ============================================
// Comp Watch DB — Supabase-backed
// ============================================
// Competitor rent intelligence used to live in browser localStorage,
// which meant it couldn't survive a cleared browser and one team
// member's research wasn't visible to anyone else. SQL:
// supabase/migrations/20260428_comp_watch.sql

import { loadFromStorage, saveToStorage } from "./storage";
import {
  getSupabase,
  isSupabaseConfigured,
  type DbCompProperty,
  type DbCompRentHistory,
} from "./supabase";
import type { CompProperty, CompRentEntry, CompTrend } from "./types";

const LOCAL_STORAGE_KEY = "comps";
const MIGRATION_DONE_KEY = "comp_watch_supabase_migrated";

function dbToComp(row: DbCompProperty, history: DbCompRentHistory[]): CompProperty {
  return {
    id: row.id,
    name: row.name,
    address: row.address,
    distance: row.distance,
    avgRent1Bed: row.avg_rent_1bed,
    avgRent2Bed: row.avg_rent_2bed,
    avgRent4Bed: row.avg_rent_4bed,
    concessions: row.concessions,
    occupancy: row.occupancy,
    lastUpdated: row.last_updated,
    trend: row.trend as CompTrend,
    notes: row.notes,
    rentHistory: history
      .slice()
      .sort((a, b) => a.recorded_on.localeCompare(b.recorded_on))
      .map((h) => ({
        date: h.recorded_on,
        avgRent1Bed: h.avg_rent_1bed,
        avgRent2Bed: h.avg_rent_2bed,
        avgRent4Bed: h.avg_rent_4bed,
      })),
  };
}

function compToDb(c: CompProperty): Omit<DbCompProperty, "created_at" | "updated_at"> {
  return {
    id: c.id,
    name: c.name,
    address: c.address ?? "",
    distance: c.distance ?? "",
    avg_rent_1bed: c.avgRent1Bed,
    avg_rent_2bed: c.avgRent2Bed,
    avg_rent_4bed: c.avgRent4Bed,
    concessions: c.concessions ?? "",
    occupancy: c.occupancy ?? "",
    last_updated: c.lastUpdated,
    trend: c.trend,
    notes: c.notes ?? "",
  };
}

function entryToDb(e: CompRentEntry, compId: string): Omit<DbCompRentHistory, "id" | "created_at"> {
  return {
    comp_id: compId,
    recorded_on: e.date,
    avg_rent_1bed: e.avgRent1Bed,
    avg_rent_2bed: e.avgRent2Bed,
    avg_rent_4bed: e.avgRent4Bed,
  };
}

function isMissingTableError(error: { code?: string; message?: string } | null | undefined): boolean {
  if (!error) return false;
  if (error.code === "42P01") return true;
  if (error.code === "PGRST205") return true;
  return /does not exist|not found in schema|relation .* does not exist/i.test(error.message || "");
}

export async function listComps(): Promise<CompProperty[]> {
  const sb = getSupabase();
  if (!sb) return [];
  const [compsRes, histRes] = await Promise.all([
    sb.from("comp_properties").select("*").order("created_at", { ascending: true }),
    sb.from("comp_rent_history").select("*"),
  ]);
  if (compsRes.error) {
    if (!isMissingTableError(compsRes.error)) console.warn("[comp-watch-db] list comps:", compsRes.error.message);
    return [];
  }
  if (histRes.error) {
    if (!isMissingTableError(histRes.error)) console.warn("[comp-watch-db] list history:", histRes.error.message);
  }
  const history = (histRes.data ?? []) as DbCompRentHistory[];
  const byComp = new Map<string, DbCompRentHistory[]>();
  for (const h of history) {
    const list = byComp.get(h.comp_id) ?? [];
    list.push(h);
    byComp.set(h.comp_id, list);
  }
  return (compsRes.data ?? []).map((row: DbCompProperty) =>
    dbToComp(row, byComp.get(row.id) ?? []),
  );
}

/**
 * Upsert a comp property and reconcile its rent-history rows. Same-day
 * re-edits update in place via the (comp_id, recorded_on) unique
 * constraint, matching the existing client behavior.
 */
export async function upsertComp(c: CompProperty): Promise<CompProperty> {
  const sb = getSupabase();
  if (!sb) throw new Error("Supabase not configured");

  const { data: compData, error: compError } = await sb
    .from("comp_properties")
    .upsert(compToDb(c), { onConflict: "id" })
    .select("*")
    .single();
  if (compError) throw new Error(`[comp-watch-db] upsert comp: ${compError.message}`);

  if (c.rentHistory.length > 0) {
    const rows = c.rentHistory.map((e) => entryToDb(e, c.id));
    const { error: histError } = await sb
      .from("comp_rent_history")
      .upsert(rows, { onConflict: "comp_id,recorded_on" });
    if (histError) throw new Error(`[comp-watch-db] upsert history: ${histError.message}`);
  }

  const { data: histData } = await sb
    .from("comp_rent_history")
    .select("*")
    .eq("comp_id", c.id);
  return dbToComp(compData as DbCompProperty, (histData ?? []) as DbCompRentHistory[]);
}

export async function deleteComp(id: string): Promise<void> {
  const sb = getSupabase();
  if (!sb) throw new Error("Supabase not configured");
  // ON DELETE CASCADE removes rent_history rows.
  const { error } = await sb.from("comp_properties").delete().eq("id", id);
  if (error) throw new Error(`[comp-watch-db] delete: ${error.message}`);
}

// ─── One-time localStorage → Supabase migration ────────────────

export async function migrateLocalToSupabaseIfNeeded(): Promise<{
  migrated: boolean;
  count?: number;
}> {
  if (typeof window === "undefined") return { migrated: false };
  if (loadFromStorage<boolean>(MIGRATION_DONE_KEY, false)) return { migrated: false };
  if (!isSupabaseConfigured()) return { migrated: false };

  const sb = getSupabase();
  if (!sb) return { migrated: false };

  const local = loadFromStorage<CompProperty[]>(LOCAL_STORAGE_KEY, []);

  const { data: existing, error: checkError } = await sb
    .from("comp_properties")
    .select("id")
    .limit(1);
  if (checkError) return { migrated: false };

  if ((existing || []).length > 0) {
    saveToStorage(MIGRATION_DONE_KEY, true);
    return { migrated: false };
  }

  if (local.length > 0) {
    const compRows = local.map(compToDb);
    const { error: compErr } = await sb
      .from("comp_properties")
      .upsert(compRows, { onConflict: "id" });
    if (compErr) {
      console.warn("[comp-watch-db] migration comp upsert failed:", compErr.message);
      return { migrated: false };
    }

    const histRows = local.flatMap((c) => c.rentHistory.map((e) => entryToDb(e, c.id)));
    if (histRows.length > 0) {
      const { error: histErr } = await sb
        .from("comp_rent_history")
        .upsert(histRows, { onConflict: "comp_id,recorded_on" });
      if (histErr) {
        console.warn("[comp-watch-db] migration history upsert failed:", histErr.message);
        return { migrated: false };
      }
    }
  }

  saveToStorage(MIGRATION_DONE_KEY, true);
  return { migrated: true, count: local.length };
}
