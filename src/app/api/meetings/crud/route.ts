import { NextResponse } from "next/server";
import {
  createMeeting,
  deleteMeeting,
  getMeeting,
  listMeetings,
  listOpenActionItems,
  updateMeeting,
  type CreateMeetingInput,
  type UpdateMeetingInput,
} from "@/lib/meetings-db";
import type { DbAgendaCarryOver, DbAgendaSnapshot } from "@/lib/supabase";

/**
 * GET /api/meetings/crud
 *   ?id=<meeting_id>   fetch a single meeting
 *   (no params)        list all meetings (newest first)
 */
export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const id = url.searchParams.get("id");
    if (id) {
      const meeting = await getMeeting(id);
      if (!meeting) return NextResponse.json({ error: "Not found" }, { status: 404 });
      return NextResponse.json({ meeting });
    }
    const meetings = await listMeetings();
    return NextResponse.json({ meetings });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

/**
 * POST /api/meetings/crud
 *
 * Body:
 * {
 *   id: string,
 *   meeting_date: string,               // YYYY-MM-DD
 *   title?: string,
 *   agenda?: { workOrders, vacancies }, // optional pre-built agenda (minus carry-over)
 *   attendees?: string[]
 * }
 *
 * Always fetches open carry-over action items (portfolio-wide) and merges
 * them into agenda_snapshot so the new meeting opens with prior-meeting
 * follow-ups already on the agenda.
 */
export async function POST(request: Request) {
  try {
    const body = await request.json();
    if (!body?.id || !body?.meeting_date) {
      return NextResponse.json(
        { error: "Missing id or meeting_date" },
        { status: 400 }
      );
    }

    const openItems = await listOpenActionItems();
    const carryOver: DbAgendaCarryOver[] = openItems.map((i) => ({
      id: i.id,
      title: i.title,
      description: i.description,
      assignedTo: i.assigned_to,
      dueDate: i.due_date,
      status: i.status,
    }));

    const agenda: DbAgendaSnapshot = {
      workOrders: body.agenda?.workOrders ?? [],
      vacancies: body.agenda?.vacancies ?? [],
      carryOverActions: carryOver,
    };

    const input: CreateMeetingInput = {
      id: String(body.id),
      meeting_date: String(body.meeting_date),
      title: body.title ?? null,
      agenda_snapshot: agenda,
      attendees: Array.isArray(body.attendees) ? body.attendees : [],
    };

    const meeting = await createMeeting(input);
    return NextResponse.json({ meeting });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

/**
 * PATCH /api/meetings/crud?id=<meeting_id>
 *
 * Body: partial UpdateMeetingInput fields.
 */
export async function PATCH(request: Request) {
  try {
    const url = new URL(request.url);
    const id = url.searchParams.get("id");
    if (!id) return NextResponse.json({ error: "Missing id" }, { status: 400 });

    const body = await request.json();
    const update: UpdateMeetingInput = {};
    if ("status" in body) update.status = body.status;
    if ("title" in body) update.title = body.title ?? null;
    if ("audio_url" in body) update.audio_url = body.audio_url ?? null;
    if ("transcript" in body) update.transcript = body.transcript ?? null;
    if ("summary" in body) update.summary = body.summary ?? null;
    if ("notes" in body) update.notes = body.notes ?? null;
    if ("agenda_snapshot" in body) update.agenda_snapshot = body.agenda_snapshot ?? {};
    if ("attendees" in body && Array.isArray(body.attendees)) update.attendees = body.attendees;
    if ("recorded_at" in body) update.recorded_at = body.recorded_at ?? null;
    if ("recording_duration_seconds" in body) {
      update.recording_duration_seconds = body.recording_duration_seconds ?? null;
    }

    const meeting = await updateMeeting(id, update);
    return NextResponse.json({ meeting });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

/** DELETE /api/meetings/crud?id=<meeting_id> */
export async function DELETE(request: Request) {
  try {
    const url = new URL(request.url);
    const id = url.searchParams.get("id");
    if (!id) return NextResponse.json({ error: "Missing id" }, { status: 400 });
    await deleteMeeting(id);
    return NextResponse.json({ ok: true });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
