// ============================================
// Tours DB — Supabase-backed
// ============================================
// Tours used to live in browser localStorage which meant one leasing
// agent couldn't see another's open-house registrations. Two tables
// mirror the showings-db split: tour_slots (parent) and
// tour_registrations (child). SQL: supabase/migrations/20260428_tours.sql

import { loadFromStorage, saveToStorage } from "./storage";
import {
  getSupabase,
  isSupabaseConfigured,
  type DbTourRegistration,
  type DbTourSlot,
} from "./supabase";
import type {
  TourRegistration,
  TourRegistrationStatus,
  TourSlot,
} from "./types";

const LOCAL_STORAGE_KEY = "tours";
const MIGRATION_DONE_KEY = "tours_supabase_migrated";

function dbToSlot(slot: DbTourSlot, regs: DbTourRegistration[]): TourSlot {
  return {
    id: slot.id,
    propertyId: slot.property_id ?? "",
    propertyName: slot.property_name,
    date: slot.date,
    startTime: slot.start_time,
    endTime: slot.end_time,
    host: slot.host,
    capacity: slot.capacity,
    preReminderStatus: slot.pre_reminder_status as TourSlot["preReminderStatus"],
    postFollowUpStatus: slot.post_follow_up_status as TourSlot["postFollowUpStatus"],
    notes: slot.notes,
    createdAt: slot.created_at,
    registrations: regs.map(dbToRegistration),
  };
}

function dbToRegistration(row: DbTourRegistration): TourRegistration {
  return {
    id: row.id,
    prospectName: row.prospect_name,
    prospectEmail: row.prospect_email,
    prospectPhone: row.prospect_phone ?? undefined,
    status: row.status as TourRegistrationStatus,
    registeredAt: row.registered_at,
    source: row.source ?? undefined,
    notes: row.notes ?? undefined,
    followUpSent: row.follow_up_sent,
  };
}

function slotToDb(s: TourSlot): Omit<DbTourSlot, "created_at" | "updated_at"> {
  return {
    id: s.id,
    property_id: s.propertyId || null,
    property_name: s.propertyName,
    date: s.date,
    start_time: s.startTime,
    end_time: s.endTime,
    host: s.host,
    capacity: s.capacity,
    pre_reminder_status: s.preReminderStatus,
    post_follow_up_status: s.postFollowUpStatus,
    notes: s.notes ?? "",
  };
}

function registrationToDb(
  r: TourRegistration,
  slotId: string,
): Omit<DbTourRegistration, "created_at" | "updated_at"> {
  return {
    id: r.id,
    slot_id: slotId,
    prospect_name: r.prospectName,
    prospect_email: r.prospectEmail,
    prospect_phone: r.prospectPhone || null,
    status: r.status,
    registered_at: r.registeredAt,
    source: r.source || null,
    notes: r.notes || null,
    follow_up_sent: !!r.followUpSent,
  };
}

function isMissingTableError(error: { code?: string; message?: string } | null | undefined): boolean {
  if (!error) return false;
  if (error.code === "42P01") return true;
  if (error.code === "PGRST205") return true;
  return /does not exist|not found in schema|relation .* does not exist/i.test(error.message || "");
}

export async function listTourSlots(): Promise<TourSlot[]> {
  const sb = getSupabase();
  if (!sb) return [];
  const [slotsRes, regsRes] = await Promise.all([
    sb.from("tour_slots").select("*").order("date", { ascending: false }),
    sb.from("tour_registrations").select("*"),
  ]);
  if (slotsRes.error) {
    if (!isMissingTableError(slotsRes.error)) console.warn("[tours-db] list slots:", slotsRes.error.message);
    return [];
  }
  if (regsRes.error) {
    if (!isMissingTableError(regsRes.error)) console.warn("[tours-db] list regs:", regsRes.error.message);
  }
  const regs = (regsRes.data ?? []) as DbTourRegistration[];
  const regsBySlot = new Map<string, DbTourRegistration[]>();
  for (const r of regs) {
    const list = regsBySlot.get(r.slot_id) ?? [];
    list.push(r);
    regsBySlot.set(r.slot_id, list);
  }
  return (slotsRes.data ?? []).map((s: DbTourSlot) =>
    dbToSlot(s, regsBySlot.get(s.id) ?? []),
  );
}

/**
 * Upsert a tour slot together with its registrations. The slot is
 * upserted, then the registration set is reconciled: rows the slot no
 * longer references are deleted; the rest are upserted.
 */
export async function upsertTourSlot(s: TourSlot): Promise<TourSlot> {
  const sb = getSupabase();
  if (!sb) throw new Error("Supabase not configured");

  const { data: slotData, error: slotError } = await sb
    .from("tour_slots")
    .upsert(slotToDb(s), { onConflict: "id" })
    .select("*")
    .single();
  if (slotError) throw new Error(`[tours-db] upsert slot: ${slotError.message}`);

  // Reconcile registrations: delete any rows for this slot that aren't in the incoming list, then upsert the rest.
  const incomingIds = new Set(s.registrations.map((r) => r.id));
  const { data: existing, error: existingError } = await sb
    .from("tour_registrations")
    .select("id")
    .eq("slot_id", s.id);
  if (existingError) throw new Error(`[tours-db] read regs: ${existingError.message}`);
  const toDelete = (existing ?? [])
    .map((r: { id: string }) => r.id)
    .filter((id: string) => !incomingIds.has(id));
  if (toDelete.length > 0) {
    const { error: delError } = await sb
      .from("tour_registrations")
      .delete()
      .in("id", toDelete);
    if (delError) throw new Error(`[tours-db] delete regs: ${delError.message}`);
  }

  if (s.registrations.length > 0) {
    const rows = s.registrations.map((r) => registrationToDb(r, s.id));
    const { error: regError } = await sb
      .from("tour_registrations")
      .upsert(rows, { onConflict: "id" });
    if (regError) throw new Error(`[tours-db] upsert regs: ${regError.message}`);
  }

  return dbToSlot(slotData as DbTourSlot, s.registrations.map((r) => ({
    ...registrationToDb(r, s.id),
    created_at: r.registeredAt,
    updated_at: r.registeredAt,
  })));
}

export async function deleteTourSlot(id: string): Promise<void> {
  const sb = getSupabase();
  if (!sb) throw new Error("Supabase not configured");
  // tour_registrations FK has ON DELETE CASCADE, so children go with it.
  const { error } = await sb.from("tour_slots").delete().eq("id", id);
  if (error) throw new Error(`[tours-db] delete slot: ${error.message}`);
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

  const local = loadFromStorage<TourSlot[]>(LOCAL_STORAGE_KEY, []);

  const { data: existing, error: checkError } = await sb
    .from("tour_slots")
    .select("id")
    .limit(1);

  if (checkError) {
    return { migrated: false };
  }

  if ((existing || []).length > 0) {
    saveToStorage(MIGRATION_DONE_KEY, true);
    return { migrated: false };
  }

  if (local.length > 0) {
    const slotRows = local.map(slotToDb);
    const { error: slotErr } = await sb
      .from("tour_slots")
      .upsert(slotRows, { onConflict: "id" });
    if (slotErr) {
      console.warn("[tours-db] migration slot upsert failed:", slotErr.message);
      return { migrated: false };
    }

    const regRows = local.flatMap((slot) =>
      slot.registrations.map((r) => registrationToDb(r, slot.id)),
    );
    if (regRows.length > 0) {
      const { error: regErr } = await sb
        .from("tour_registrations")
        .upsert(regRows, { onConflict: "id" });
      if (regErr) {
        console.warn("[tours-db] migration reg upsert failed:", regErr.message);
        return { migrated: false };
      }
    }
  }

  saveToStorage(MIGRATION_DONE_KEY, true);
  return { migrated: true, count: local.length };
}
