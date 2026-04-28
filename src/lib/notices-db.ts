// ============================================
// Notices DB — Supabase-backed
// ============================================
// Previously the /notices page kept records in browser localStorage.
// These are legal/compliance artifacts (lease violations, rent
// reminders, lease renewals) that need an audit trail and team-wide
// visibility, so they belong in Supabase. SQL:
// supabase/migrations/20260428_notices.sql

import { loadFromStorage, saveToStorage } from "./storage";
import { getSupabase, isSupabaseConfigured, type DbNotice } from "./supabase";
import type {
  Notice,
  NoticeDeliveryMethod,
  NoticeRecipientType,
  NoticeStatus,
  NoticeType,
} from "./types";

const LOCAL_STORAGE_KEY = "notices";
const MIGRATION_DONE_KEY = "notices_supabase_migrated";

function dbToNotice(row: DbNotice): Notice {
  return {
    id: row.id,
    type: row.type as NoticeType,
    status: row.status as NoticeStatus,
    subject: row.subject,
    body: row.body ?? "",
    recipientType: row.recipient_type as NoticeRecipientType,
    propertyId: row.property_id ?? undefined,
    unitId: row.unit_id ?? undefined,
    unitName: row.unit_name ?? "",
    tenantName: row.tenant_name ?? "",
    deliveryMethod: row.delivery_method as NoticeDeliveryMethod,
    createdAt: row.created_at,
    sentAt: row.sent_at ?? "",
    deliveredAt: row.delivered_at ?? undefined,
    acknowledgedAt: row.acknowledged_at ?? undefined,
  };
}

function noticeToDb(n: Notice): Omit<DbNotice, "created_at" | "updated_at"> {
  return {
    id: n.id,
    type: n.type,
    status: n.status,
    subject: n.subject,
    body: n.body ?? "",
    recipient_type: n.recipientType,
    property_id: n.propertyId || null,
    unit_id: n.unitId || null,
    unit_name: n.unitName ?? "",
    tenant_name: n.tenantName ?? "",
    delivery_method: n.deliveryMethod,
    sent_at: n.sentAt || null,
    delivered_at: n.deliveredAt || null,
    acknowledged_at: n.acknowledgedAt || null,
  };
}

function isMissingTableError(error: { code?: string; message?: string } | null | undefined): boolean {
  if (!error) return false;
  if (error.code === "42P01") return true;
  if (error.code === "PGRST205") return true;
  return /does not exist|not found in schema|relation .* does not exist/i.test(error.message || "");
}

export async function listNotices(): Promise<Notice[]> {
  const sb = getSupabase();
  if (!sb) return [];
  const { data, error } = await sb
    .from("notices")
    .select("*")
    .order("created_at", { ascending: false });
  if (error) {
    if (!isMissingTableError(error)) console.warn("[notices-db] list:", error.message);
    return [];
  }
  return (data ?? []).map((r: DbNotice) => dbToNotice(r));
}

export async function upsertNotice(n: Notice): Promise<Notice> {
  const sb = getSupabase();
  if (!sb) throw new Error("Supabase not configured");
  const { data, error } = await sb
    .from("notices")
    .upsert(noticeToDb(n), { onConflict: "id" })
    .select("*")
    .single();
  if (error) throw new Error(`[notices-db] upsert: ${error.message}`);
  return dbToNotice(data as DbNotice);
}

export async function deleteNotice(id: string): Promise<void> {
  const sb = getSupabase();
  if (!sb) throw new Error("Supabase not configured");
  const { error } = await sb.from("notices").delete().eq("id", id);
  if (error) throw new Error(`[notices-db] delete: ${error.message}`);
}

// ─── One-time localStorage → Supabase migration ────────────────
// On first successful connection to Supabase, copy any existing
// localStorage notices up so the user doesn't lose drafts/sent
// records they built up before this migration.

export async function migrateLocalToSupabaseIfNeeded(): Promise<{
  migrated: boolean;
  count?: number;
}> {
  if (typeof window === "undefined") return { migrated: false };
  if (loadFromStorage<boolean>(MIGRATION_DONE_KEY, false)) return { migrated: false };
  if (!isSupabaseConfigured()) return { migrated: false };

  const sb = getSupabase();
  if (!sb) return { migrated: false };

  const local = loadFromStorage<Notice[]>(LOCAL_STORAGE_KEY, []);

  // Confirm the table exists and check whether Supabase already has data
  const { data: existing, error: checkError } = await sb
    .from("notices")
    .select("id")
    .limit(1);

  if (checkError) {
    // Table probably doesn't exist yet; user hasn't run the migration SQL.
    // Don't mark migration as done — try again next load.
    return { migrated: false };
  }

  if ((existing || []).length > 0) {
    // Supabase already has data — skip migration, mark done so we don't keep checking
    saveToStorage(MIGRATION_DONE_KEY, true);
    return { migrated: false };
  }

  if (local.length > 0) {
    const rows = local.map(noticeToDb);
    const { error: upsertError } = await sb.from("notices").upsert(rows, { onConflict: "id" });
    if (upsertError) {
      console.warn("[notices-db] migration upsert failed:", upsertError.message);
      return { migrated: false };
    }
  }

  saveToStorage(MIGRATION_DONE_KEY, true);
  return { migrated: true, count: local.length };
}
