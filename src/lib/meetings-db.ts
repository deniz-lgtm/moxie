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
  type DbActionItemAttachment,
  type DbActionItemComment,
  type DbAgendaSnapshot,
  type DbMeetingActionItem,
  type DbPropertyMeeting,
  type ActionItemStatus,
  type MeetingStatus,
} from "./supabase";

const ATTACHMENT_BUCKET = "meeting-attachments";

function isMissingTableError(error: { code?: string; message?: string } | null | undefined): boolean {
  if (!error) return false;
  if (error.code === "42P01") return true;
  if (error.code === "PGRST205") return true;
  const msg = error.message || "";
  return /does not exist|not found in schema|relation .* does not exist/i.test(msg);
}

export type CreateMeetingInput = {
  id: string;
  property_id?: string | null;
  property_name?: string | null;
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

export async function listMeetings(): Promise<DbPropertyMeeting[]> {
  const sb = getSupabase();
  if (!sb) return [];

  const { data, error } = await sb
    .from("property_meetings")
    .select("*")
    .order("meeting_date", { ascending: false });

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
    property_id: input.property_id ?? null,
    property_name: input.property_name ?? null,
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
  "created_at" | "updated_at" | "completed_at" | "completed_by" | "comments" | "attachments"
> & {
  completed_at?: string | null;
  completed_by?: string | null;
  comments?: DbActionItemComment[];
  attachments?: DbActionItemAttachment[];
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

// ─── Comments & attachments ──────────────────────────────────────

async function getItemOrThrow(id: string): Promise<DbMeetingActionItem> {
  const sb = getSupabase();
  if (!sb) throw new Error("Supabase not configured");
  const { data, error } = await sb
    .from("meeting_action_items")
    .select("*")
    .eq("id", id)
    .single();
  if (error) throw new Error(`[meetings-db] getItem: ${error.message}`);
  return data as DbMeetingActionItem;
}

export async function appendComment(
  id: string,
  comment: { text: string; author?: string }
): Promise<DbMeetingActionItem> {
  const sb = getSupabase();
  if (!sb) throw new Error("Supabase not configured");
  const existing = await getItemOrThrow(id);
  const newComment: DbActionItemComment = {
    id: `c_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`,
    text: comment.text,
    author: comment.author ?? null,
    created_at: new Date().toISOString(),
  };
  const comments = [...(existing.comments || []), newComment];
  const { data, error } = await sb
    .from("meeting_action_items")
    .update({ comments })
    .eq("id", id)
    .select("*")
    .single();
  if (error) throw new Error(`[meetings-db] appendComment: ${error.message}`);
  return data as DbMeetingActionItem;
}

export async function deleteComment(id: string, commentId: string): Promise<DbMeetingActionItem> {
  const sb = getSupabase();
  if (!sb) throw new Error("Supabase not configured");
  const existing = await getItemOrThrow(id);
  const comments = (existing.comments || []).filter((c) => c.id !== commentId);
  const { data, error } = await sb
    .from("meeting_action_items")
    .update({ comments })
    .eq("id", id)
    .select("*")
    .single();
  if (error) throw new Error(`[meetings-db] deleteComment: ${error.message}`);
  return data as DbMeetingActionItem;
}

/** Upload an attachment blob to Supabase storage and append to the item. */
export async function uploadAttachment(
  itemId: string,
  file: {
    name: string;
    contentType: string;
    size: number;
    dataUrl: string;
  },
  uploadedBy?: string
): Promise<DbMeetingActionItem> {
  const sb = getSupabase();
  if (!sb) throw new Error("Supabase not configured");

  const attachmentId = `att_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
  const ext = (file.name.split(".").pop() || "bin").toLowerCase().slice(0, 10);
  const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
  const path = `${itemId}/${attachmentId}-${safeName}`;

  // Decode dataUrl → blob
  const res = await fetch(file.dataUrl);
  const blob = await res.blob();

  const { error: uploadError } = await sb.storage
    .from(ATTACHMENT_BUCKET)
    .upload(path, blob, { contentType: file.contentType, upsert: false });
  if (uploadError) throw new Error(`[meetings-db] upload: ${uploadError.message}`);

  const { data: publicUrlData } = sb.storage.from(ATTACHMENT_BUCKET).getPublicUrl(path);
  const attachment: DbActionItemAttachment = {
    id: attachmentId,
    name: file.name,
    url: publicUrlData.publicUrl,
    content_type: file.contentType,
    size: file.size,
    uploaded_at: new Date().toISOString(),
    uploaded_by: uploadedBy ?? null,
    storage_path: path,
  };

  const existing = await getItemOrThrow(itemId);
  const attachments = [...(existing.attachments || []), attachment];
  const { data, error } = await sb
    .from("meeting_action_items")
    .update({ attachments })
    .eq("id", itemId)
    .select("*")
    .single();
  if (error) throw new Error(`[meetings-db] updateAttachments: ${error.message}`);
  // Suppress unused-var warning for ext
  void ext;
  return data as DbMeetingActionItem;
}

export async function deleteAttachment(
  itemId: string,
  attachmentId: string
): Promise<DbMeetingActionItem> {
  const sb = getSupabase();
  if (!sb) throw new Error("Supabase not configured");
  const existing = await getItemOrThrow(itemId);
  const target = (existing.attachments || []).find((a) => a.id === attachmentId);
  if (target?.storage_path) {
    await sb.storage.from(ATTACHMENT_BUCKET).remove([target.storage_path]);
  }
  const attachments = (existing.attachments || []).filter((a) => a.id !== attachmentId);
  const { data, error } = await sb
    .from("meeting_action_items")
    .update({ attachments })
    .eq("id", itemId)
    .select("*")
    .single();
  if (error) throw new Error(`[meetings-db] deleteAttachment: ${error.message}`);
  return data as DbMeetingActionItem;
}

/**
 * All open action items across prior meetings. Used to build the
 * "carry-over" agenda block when a new meeting is generated.
 */
export async function listOpenActionItems(): Promise<DbMeetingActionItem[]> {
  const sb = getSupabase();
  if (!sb) return [];

  const { data, error } = await sb
    .from("meeting_action_items")
    .select("*")
    .in("status", ["open", "in_progress"])
    .order("created_at", { ascending: true });
  if (error) {
    if (!isMissingTableError(error)) {
      console.warn("[meetings-db] listOpenActionItems:", error.message);
    }
    return [];
  }
  return (data ?? []) as DbMeetingActionItem[];
}
