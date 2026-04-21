// ============================================
// Property Meetings DB — Supabase CRUD helpers
// ============================================
// Backs the Monday morning meeting feature. Meetings are per-property;
// action items are children of meetings and reviewed at the top of the
// next meeting. Agenda snapshots freeze the open work orders / vacancies
// surfaced at meeting creation time so they don't shift under the team's
// feet as AppFolio syncs happen mid-meeting.

import {
  getSupabase,
  type DbAgendaSnapshot,
  type DbMeetingActionItem,
  type DbPropertyMeeting,
  type ActionItemStatus,
  type MeetingStatus,
} from "./supabase";

function isMissingTableError(error: { code?: string; message?: string } | null | undefined): boolean {
  if (!error) return false;
  if (error.code === "42P01") return true;
  if (error.code === "PGRST205") return true;
  const msg = error.message || "";
  return /does not exist|not found in schema|relation .* does not exist/i.test(msg);
}

export type CreateMeetingInput = {
  id: string;
  property_id: string;
  property_name: string;
  meeting_date: string;
  title?: string | null;
  agenda_snapshot?: DbAgendaSnapshot;
  attendees?: string[];
};

export type UpdateMeetingInput = Partial<{
  status: MeetingStatus;
  title: string | null;
  audio_url: string | null;
  transcript: string | null;
  summary: string | null;
  notes: string | null;
  agenda_snapshot: DbAgendaSnapshot;
  attendees: string[];
  recorded_at: string | null;
  recording_duration_seconds: number | null;
}>;

export async function listMeetings(propertyId?: string): Promise<DbPropertyMeeting[]> {
  const sb = getSupabase();
  if (!sb) return [];

  let query = sb
    .from("property_meetings")
    .select("*")
    .order("meeting_date", { ascending: false });
  if (propertyId) query = query.eq("property_id", propertyId);

  const { data, error } = await query;
  if (error) {
    if (!isMissingTableError(error)) {
      console.warn("[meetings-db] listMeetings:", error.message);
    }
    return [];
  }
  return (data ?? []) as DbPropertyMeeting[];
}

export async function getMeeting(id: string): Promise<DbPropertyMeeting | null> {
  const sb = getSupabase();
  if (!sb) return null;
  const { data, error } = await sb
    .from("property_meetings")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (error) {
    if (!isMissingTableError(error)) {
      console.warn("[meetings-db] getMeeting:", error.message);
    }
    return null;
  }
  return (data as DbPropertyMeeting) ?? null;
}

export async function createMeeting(input: CreateMeetingInput): Promise<DbPropertyMeeting> {
  const sb = getSupabase();
  if (!sb) throw new Error("Supabase not configured");

  const row = {
    id: input.id,
    property_id: input.property_id,
    property_name: input.property_name,
    meeting_date: input.meeting_date,
    status: "scheduled" as MeetingStatus,
    title: input.title ?? null,
    agenda_snapshot: input.agenda_snapshot ?? {},
    attendees: input.attendees ?? [],
  };

  const { data, error } = await sb
    .from("property_meetings")
    .insert(row)
    .select("*")
    .single();
  if (error) throw new Error(`[meetings-db] createMeeting: ${error.message}`);
  return data as DbPropertyMeeting;
}

export async function updateMeeting(id: string, update: UpdateMeetingInput): Promise<DbPropertyMeeting> {
  const sb = getSupabase();
  if (!sb) throw new Error("Supabase not configured");

  const { data, error } = await sb
    .from("property_meetings")
    .update(update)
    .eq("id", id)
    .select("*")
    .single();
  if (error) throw new Error(`[meetings-db] updateMeeting: ${error.message}`);
  return data as DbPropertyMeeting;
}

export async function deleteMeeting(id: string): Promise<void> {
  const sb = getSupabase();
  if (!sb) throw new Error("Supabase not configured");
  const { error } = await sb.from("property_meetings").delete().eq("id", id);
  if (error) throw new Error(`[meetings-db] deleteMeeting: ${error.message}`);
}

// ─── Action Items ────────────────────────────────────────────────

export type CreateActionItemInput = Omit<
  DbMeetingActionItem,
  "created_at" | "updated_at" | "completed_at" | "completed_by"
> & {
  completed_at?: string | null;
  completed_by?: string | null;
};

export type UpdateActionItemInput = Partial<
  Omit<DbMeetingActionItem, "id" | "meeting_id" | "property_id" | "created_at" | "updated_at">
>;

export async function listActionItems(opts: {
  meetingId?: string;
  propertyId?: string;
  status?: ActionItemStatus;
}): Promise<DbMeetingActionItem[]> {
  const sb = getSupabase();
  if (!sb) return [];

  let query = sb
    .from("meeting_action_items")
    .select("*")
    .order("created_at", { ascending: true });
  if (opts.meetingId) query = query.eq("meeting_id", opts.meetingId);
  if (opts.propertyId) query = query.eq("property_id", opts.propertyId);
  if (opts.status) query = query.eq("status", opts.status);

  const { data, error } = await query;
  if (error) {
    if (!isMissingTableError(error)) {
      console.warn("[meetings-db] listActionItems:", error.message);
    }
    return [];
  }
  return (data ?? []) as DbMeetingActionItem[];
}

export async function createActionItem(input: CreateActionItemInput): Promise<DbMeetingActionItem> {
  const sb = getSupabase();
  if (!sb) throw new Error("Supabase not configured");

  const { data, error } = await sb
    .from("meeting_action_items")
    .insert(input)
    .select("*")
    .single();
  if (error) throw new Error(`[meetings-db] createActionItem: ${error.message}`);
  return data as DbMeetingActionItem;
}

export async function bulkCreateActionItems(items: CreateActionItemInput[]): Promise<DbMeetingActionItem[]> {
  const sb = getSupabase();
  if (!sb) throw new Error("Supabase not configured");
  if (items.length === 0) return [];

  const { data, error } = await sb
    .from("meeting_action_items")
    .insert(items)
    .select("*");
  if (error) throw new Error(`[meetings-db] bulkCreateActionItems: ${error.message}`);
  return (data ?? []) as DbMeetingActionItem[];
}

export async function updateActionItem(id: string, update: UpdateActionItemInput): Promise<DbMeetingActionItem> {
  const sb = getSupabase();
  if (!sb) throw new Error("Supabase not configured");

  const patch: Record<string, unknown> = { ...update };
  if (update.status === "completed" && !("completed_at" in update)) {
    patch.completed_at = new Date().toISOString();
  }
  if (update.status && update.status !== "completed" && !("completed_at" in update)) {
    patch.completed_at = null;
  }

  const { data, error } = await sb
    .from("meeting_action_items")
    .update(patch)
    .eq("id", id)
    .select("*")
    .single();
  if (error) throw new Error(`[meetings-db] updateActionItem: ${error.message}`);
  return data as DbMeetingActionItem;
}

export async function deleteActionItem(id: string): Promise<void> {
  const sb = getSupabase();
  if (!sb) throw new Error("Supabase not configured");
  const { error } = await sb.from("meeting_action_items").delete().eq("id", id);
  if (error) throw new Error(`[meetings-db] deleteActionItem: ${error.message}`);
}

/**
 * Open action items for a property across all prior meetings. Used to
 * build the "carry-over" agenda block when a new meeting is generated.
 */
export async function listOpenActionItemsForProperty(propertyId: string): Promise<DbMeetingActionItem[]> {
  const sb = getSupabase();
  if (!sb) return [];

  const { data, error } = await sb
    .from("meeting_action_items")
    .select("*")
    .eq("property_id", propertyId)
    .in("status", ["open", "in_progress"])
    .order("created_at", { ascending: true });
  if (error) {
    if (!isMissingTableError(error)) {
      console.warn("[meetings-db] listOpenActionItemsForProperty:", error.message);
    }
    return [];
  }
  return (data ?? []) as DbMeetingActionItem[];
}
