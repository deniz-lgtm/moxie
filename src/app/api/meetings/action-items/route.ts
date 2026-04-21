import { NextResponse } from "next/server";
import {
  appendComment,
  bulkCreateActionItems,
  createActionItem,
  deleteActionItem,
  deleteComment,
  listActionItems,
  updateActionItem,
  type CreateActionItemInput,
  type UpdateActionItemInput,
} from "@/lib/meetings-db";
import type { ActionItemSource, ActionItemStatus } from "@/lib/supabase";

/**
 * GET /api/meetings/action-items
 *   ?meeting_id=<id>     items for a specific meeting
 *   ?property_id=<id>    items for a property (all meetings)
 *   ?status=<status>     filter by status
 */
export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const items = await listActionItems({
      meetingId: url.searchParams.get("meeting_id") || undefined,
      propertyId: url.searchParams.get("property_id") || undefined,
      status: (url.searchParams.get("status") as ActionItemStatus) || undefined,
    });
    return NextResponse.json({ items });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

/**
 * POST /api/meetings/action-items
 *
 * Body — single create:
 * { id, meeting_id, property_id, title, description?, assigned_to?, due_date?, status?, priority?, source?, ... }
 *
 * Body — bulk create:
 * { items: [ ... ] }
 */
export async function POST(request: Request) {
  try {
    const body = await request.json();

    if (Array.isArray(body?.items)) {
      const rows: CreateActionItemInput[] = body.items.map((r: any) => normalizeCreate(r));
      const created = await bulkCreateActionItems(rows);
      return NextResponse.json({ items: created });
    }

    const row = normalizeCreate(body);
    const item = await createActionItem(row);
    return NextResponse.json({ item });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

/**
 * PATCH /api/meetings/action-items?id=<action_item_id>
 *
 * Body: partial fields, plus (exclusive) helpers:
 *   { appendComment: { text, author? } }      → append to comments thread
 *   { deleteCommentId: string }               → remove a comment by id
 */
export async function PATCH(request: Request) {
  try {
    const url = new URL(request.url);
    const id = url.searchParams.get("id");
    if (!id) return NextResponse.json({ error: "Missing id" }, { status: 400 });

    const body = await request.json();

    if (body?.appendComment?.text) {
      const item = await appendComment(id, {
        text: String(body.appendComment.text),
        author: body.appendComment.author,
      });
      return NextResponse.json({ item });
    }
    if (body?.deleteCommentId) {
      const item = await deleteComment(id, String(body.deleteCommentId));
      return NextResponse.json({ item });
    }

    const update: UpdateActionItemInput = {};
    if ("title" in body) update.title = body.title;
    if ("description" in body) update.description = body.description ?? null;
    if ("assigned_to" in body) update.assigned_to = body.assigned_to ?? null;
    if ("due_date" in body) update.due_date = body.due_date ?? null;
    if ("status" in body) update.status = body.status;
    if ("priority" in body) update.priority = body.priority ?? null;
    if ("source" in body) update.source = body.source;
    if ("completed_by" in body) update.completed_by = body.completed_by ?? null;
    if ("linked_work_order_id" in body) update.linked_work_order_id = body.linked_work_order_id ?? null;
    if ("linked_unit_id" in body) update.linked_unit_id = body.linked_unit_id ?? null;

    const item = await updateActionItem(id, update);
    return NextResponse.json({ item });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

/** DELETE /api/meetings/action-items?id=<action_item_id> */
export async function DELETE(request: Request) {
  try {
    const url = new URL(request.url);
    const id = url.searchParams.get("id");
    if (!id) return NextResponse.json({ error: "Missing id" }, { status: 400 });
    await deleteActionItem(id);
    return NextResponse.json({ ok: true });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

function normalizeCreate(r: any): CreateActionItemInput {
  if (!r?.id || !r?.meeting_id || !r?.property_id || !r?.title) {
    throw new Error("action item requires id, meeting_id, property_id, title");
  }
  return {
    id: String(r.id),
    meeting_id: String(r.meeting_id),
    property_id: String(r.property_id),
    title: String(r.title),
    description: r.description ?? null,
    assigned_to: r.assigned_to ?? null,
    due_date: r.due_date ?? null,
    status: (r.status as ActionItemStatus) ?? "open",
    priority: r.priority ?? null,
    source: (r.source as ActionItemSource) ?? "manual",
    completed_at: r.completed_at ?? null,
    completed_by: r.completed_by ?? null,
    linked_work_order_id: r.linked_work_order_id ?? null,
    linked_unit_id: r.linked_unit_id ?? null,
  };
}
