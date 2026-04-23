// ============================================
// Showings DB — Supabase CRUD for open-house scheduling
// ============================================
// Two tables: `showing_slots` (blocks the leasing team publishes) and
// `showing_registrations` (prospects who've signed up, one row each).

import {
  getSupabase,
  type DbShowingRegistration,
  type DbShowingSlot,
  type ShowingRegistrationStatus,
  type ShowingSlotStatus,
} from "./supabase";
import type { ShowingRegistration, ShowingSlot } from "./types";

function dbToSlot(row: DbShowingSlot, registrations: ShowingRegistration[] = []): ShowingSlot {
  return {
    id: row.id,
    propertyId: row.property_id ?? undefined,
    propertyName: row.property_name ?? undefined,
    startsAt: row.starts_at,
    endsAt: row.ends_at,
    hostUserId: row.host_user_id ?? undefined,
    hostName: row.host_name ?? undefined,
    capacity: row.capacity,
    notes: row.notes ?? undefined,
    publicDescription: row.public_description ?? undefined,
    publicToken: row.public_token,
    status: row.status,
    registrations,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function slotToDb(s: ShowingSlot): Omit<DbShowingSlot, "created_at" | "updated_at"> {
  return {
    id: s.id,
    property_id: s.propertyId ?? null,
    property_name: s.propertyName ?? null,
    starts_at: s.startsAt,
    ends_at: s.endsAt,
    host_user_id: s.hostUserId ?? null,
    host_name: s.hostName ?? null,
    capacity: s.capacity,
    notes: s.notes ?? null,
    public_description: s.publicDescription ?? null,
    public_token: s.publicToken,
    status: s.status,
  };
}

function dbToRegistration(row: DbShowingRegistration): ShowingRegistration {
  return {
    id: row.id,
    slotId: row.slot_id,
    prospectName: row.prospect_name,
    prospectEmail: row.prospect_email ?? undefined,
    prospectPhone: row.prospect_phone ?? undefined,
    partySize: row.party_size,
    status: row.status,
    notes: row.notes ?? undefined,
    guestCardId: row.guest_card_id ?? undefined,
    source: row.source ?? undefined,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function registrationToDb(
  r: ShowingRegistration
): Omit<DbShowingRegistration, "created_at" | "updated_at"> {
  return {
    id: r.id,
    slot_id: r.slotId,
    prospect_name: r.prospectName,
    prospect_email: r.prospectEmail ?? null,
    prospect_phone: r.prospectPhone ?? null,
    party_size: r.partySize,
    status: r.status,
    notes: r.notes ?? null,
    guest_card_id: r.guestCardId ?? null,
    source: r.source ?? null,
  };
}

function isMissingTableError(error: { code?: string; message?: string } | null | undefined): boolean {
  if (!error) return false;
  if (error.code === "42P01") return true;
  if (error.code === "PGRST205") return true;
  return /does not exist|not found in schema|relation .* does not exist/i.test(error.message || "");
}

/** Random URL-safe slug for the public-signup token on a slot. */
export function makePublicToken(): string {
  // 10 chars of base36 is plenty (>3e15 space) and stays URL-safe.
  return Math.random().toString(36).slice(2, 8) + Math.random().toString(36).slice(2, 8);
}

// ─── Slots ──────────────────────────────────────────────────────

export async function listShowingSlots(opts?: {
  from?: string;   // ISO — only slots starting on/after this moment
  to?: string;     // ISO — only slots starting on/before this moment
  status?: ShowingSlotStatus;
  hostUserId?: string;
  includeRegistrations?: boolean;
}): Promise<ShowingSlot[]> {
  const sb = getSupabase();
  if (!sb) return [];

  let query = sb
    .from("showing_slots")
    .select("*")
    .order("starts_at", { ascending: true });
  if (opts?.from) query = query.gte("starts_at", opts.from);
  if (opts?.to) query = query.lte("starts_at", opts.to);
  if (opts?.status) query = query.eq("status", opts.status);
  if (opts?.hostUserId) query = query.eq("host_user_id", opts.hostUserId);

  const { data, error } = await query;
  if (error) {
    if (!isMissingTableError(error)) console.warn("[showings-db] listSlots:", error.message);
    return [];
  }
  const slots = (data ?? []) as DbShowingSlot[];

  if (!opts?.includeRegistrations || slots.length === 0) {
    return slots.map((r) => dbToSlot(r));
  }

  const slotIds = slots.map((s) => s.id);
  const { data: regs, error: regErr } = await sb
    .from("showing_registrations")
    .select("*")
    .in("slot_id", slotIds);
  if (regErr) {
    if (!isMissingTableError(regErr))
      console.warn("[showings-db] hydrate registrations:", regErr.message);
    return slots.map((r) => dbToSlot(r));
  }
  const byslot = new Map<string, ShowingRegistration[]>();
  for (const r of (regs ?? []) as DbShowingRegistration[]) {
    if (!byslot.has(r.slot_id)) byslot.set(r.slot_id, []);
    byslot.get(r.slot_id)!.push(dbToRegistration(r));
  }
  return slots.map((r) => dbToSlot(r, byslot.get(r.id) ?? []));
}

export async function getShowingSlot(id: string): Promise<ShowingSlot | null> {
  const sb = getSupabase();
  if (!sb) return null;
  const { data, error } = await sb
    .from("showing_slots")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (error) {
    if (!isMissingTableError(error)) console.warn("[showings-db] getSlot:", error.message);
    return null;
  }
  if (!data) return null;
  const regs = await listRegistrationsForSlot(id);
  return dbToSlot(data as DbShowingSlot, regs);
}

export async function getShowingSlotByToken(token: string): Promise<ShowingSlot | null> {
  const sb = getSupabase();
  if (!sb) return null;
  const { data, error } = await sb
    .from("showing_slots")
    .select("*")
    .eq("public_token", token)
    .maybeSingle();
  if (error) {
    if (!isMissingTableError(error)) console.warn("[showings-db] getByToken:", error.message);
    return null;
  }
  if (!data) return null;
  const regs = await listRegistrationsForSlot(data.id);
  return dbToSlot(data as DbShowingSlot, regs);
}

export async function upsertShowingSlot(s: ShowingSlot): Promise<ShowingSlot> {
  const sb = getSupabase();
  if (!sb) throw new Error("Supabase not configured");
  const { data, error } = await sb
    .from("showing_slots")
    .upsert(slotToDb(s), { onConflict: "id" })
    .select("*")
    .single();
  if (error) throw new Error(`[showings-db] upsertSlot: ${error.message}`);
  return dbToSlot(data as DbShowingSlot);
}

export async function deleteShowingSlot(id: string): Promise<void> {
  const sb = getSupabase();
  if (!sb) throw new Error("Supabase not configured");
  const { error } = await sb.from("showing_slots").delete().eq("id", id);
  if (error) throw new Error(`[showings-db] deleteSlot: ${error.message}`);
}

// ─── Registrations ──────────────────────────────────────────────

export async function listRegistrationsForSlot(slotId: string): Promise<ShowingRegistration[]> {
  const sb = getSupabase();
  if (!sb) return [];
  const { data, error } = await sb
    .from("showing_registrations")
    .select("*")
    .eq("slot_id", slotId)
    .order("created_at", { ascending: true });
  if (error) {
    if (!isMissingTableError(error))
      console.warn("[showings-db] listRegistrations:", error.message);
    return [];
  }
  return ((data ?? []) as DbShowingRegistration[]).map(dbToRegistration);
}

export async function upsertRegistration(
  r: ShowingRegistration
): Promise<ShowingRegistration> {
  const sb = getSupabase();
  if (!sb) throw new Error("Supabase not configured");
  const { data, error } = await sb
    .from("showing_registrations")
    .upsert(registrationToDb(r), { onConflict: "id" })
    .select("*")
    .single();
  if (error) throw new Error(`[showings-db] upsertRegistration: ${error.message}`);
  return dbToRegistration(data as DbShowingRegistration);
}

export async function updateRegistrationStatus(
  id: string,
  status: ShowingRegistrationStatus
): Promise<ShowingRegistration> {
  const sb = getSupabase();
  if (!sb) throw new Error("Supabase not configured");
  const { data, error } = await sb
    .from("showing_registrations")
    .update({ status })
    .eq("id", id)
    .select("*")
    .single();
  if (error) throw new Error(`[showings-db] updateRegistrationStatus: ${error.message}`);
  return dbToRegistration(data as DbShowingRegistration);
}

export async function deleteRegistration(id: string): Promise<void> {
  const sb = getSupabase();
  if (!sb) throw new Error("Supabase not configured");
  const { error } = await sb.from("showing_registrations").delete().eq("id", id);
  if (error) throw new Error(`[showings-db] deleteRegistration: ${error.message}`);
}

/** Count registrations for a slot that count toward capacity (confirmed or attended). */
export async function countActiveRegistrations(slotId: string): Promise<number> {
  const sb = getSupabase();
  if (!sb) return 0;
  const { count, error } = await sb
    .from("showing_registrations")
    .select("id", { count: "exact", head: true })
    .eq("slot_id", slotId)
    .in("status", ["confirmed", "attended"]);
  if (error) return 0;
  return count ?? 0;
}
