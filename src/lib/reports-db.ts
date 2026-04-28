// ============================================
// Reports DB — Supabase-backed
// ============================================
// /reports is the report-generation surface (P&L, occupancy, rent
// roll, maintenance cost). Generated reports are deliverables to
// owners and need an audit trail beyond one laptop's localStorage.
// SQL: supabase/migrations/20260428_reports.sql

import { loadFromStorage, saveToStorage } from "./storage";
import { getSupabase, isSupabaseConfigured, type DbReport } from "./supabase";
import type { Report, ReportData, ReportStatus, ReportType } from "./types";

const LOCAL_STORAGE_KEY = "reports";
const MIGRATION_DONE_KEY = "reports_supabase_migrated";

function dbToReport(row: DbReport): Report {
  return {
    id: row.id,
    propertyId: row.property_id ?? "",
    propertyName: row.property_name,
    type: row.type as ReportType,
    month: row.month,
    status: row.status as ReportStatus,
    createdAt: row.created_at,
    notes: row.notes ?? "",
    data: (row.data as ReportData) ?? {},
  };
}

function reportToDb(r: Report): Omit<DbReport, "created_at" | "updated_at"> {
  return {
    id: r.id,
    property_id: r.propertyId || null,
    property_name: r.propertyName ?? "",
    type: r.type,
    month: r.month,
    status: r.status,
    notes: r.notes ?? "",
    data: r.data ?? {},
  };
}

function isMissingTableError(error: { code?: string; message?: string } | null | undefined): boolean {
  if (!error) return false;
  if (error.code === "42P01") return true;
  if (error.code === "PGRST205") return true;
  return /does not exist|not found in schema|relation .* does not exist/i.test(error.message || "");
}

export async function listReports(): Promise<Report[]> {
  const sb = getSupabase();
  if (!sb) return [];
  const { data, error } = await sb
    .from("reports")
    .select("*")
    .order("created_at", { ascending: false });
  if (error) {
    if (!isMissingTableError(error)) console.warn("[reports-db] list:", error.message);
    return [];
  }
  return (data ?? []).map((r: DbReport) => dbToReport(r));
}

export async function upsertReport(r: Report): Promise<Report> {
  const sb = getSupabase();
  if (!sb) throw new Error("Supabase not configured");
  const { data, error } = await sb
    .from("reports")
    .upsert(reportToDb(r), { onConflict: "id" })
    .select("*")
    .single();
  if (error) throw new Error(`[reports-db] upsert: ${error.message}`);
  return dbToReport(data as DbReport);
}

export async function deleteReport(id: string): Promise<void> {
  const sb = getSupabase();
  if (!sb) throw new Error("Supabase not configured");
  const { error } = await sb.from("reports").delete().eq("id", id);
  if (error) throw new Error(`[reports-db] delete: ${error.message}`);
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

  const local = loadFromStorage<Report[]>(LOCAL_STORAGE_KEY, []);

  const { data: existing, error: checkError } = await sb
    .from("reports")
    .select("id")
    .limit(1);
  if (checkError) return { migrated: false };

  if ((existing || []).length > 0) {
    saveToStorage(MIGRATION_DONE_KEY, true);
    return { migrated: false };
  }

  if (local.length > 0) {
    const rows = local.map(reportToDb);
    const { error: upsertError } = await sb.from("reports").upsert(rows, { onConflict: "id" });
    if (upsertError) {
      console.warn("[reports-db] migration upsert failed:", upsertError.message);
      return { migrated: false };
    }
  }

  saveToStorage(MIGRATION_DONE_KEY, true);
  return { migrated: true, count: local.length };
}
