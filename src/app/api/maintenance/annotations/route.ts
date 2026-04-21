import { NextRequest, NextResponse } from "next/server";
import { saveAnnotation, type AnnotationUpdate } from "@/lib/work-orders-db";

/**
 * POST /api/maintenance/annotations
 *
 * Body:
 * {
 *   id: string,                              // work_order id
 *   internal_status?: string | null,
 *   assigned_to_override?: string | null,
 *   vendor_override?: string | null,
 *   scheduled_date_override?: string | null,
 *   tags?: string[],
 *   follow_up_on?: string | null,
 *   appendNote?: { text: string, author?: string }
 * }
 *
 * Upserts the annotation row. Notes are append-only: pass `appendNote`
 * to add one, omit it to leave existing notes untouched. Any update
 * field set to `null` clears that override; omitting a field leaves it
 * unchanged.
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const id: string = body?.id;
    if (!id || typeof id !== "string") {
      return NextResponse.json({ error: "Missing id" }, { status: 400 });
    }

    const update: AnnotationUpdate = {};
    if ("internal_status" in body) update.internal_status = body.internal_status ?? null;
    if ("assigned_to_override" in body) update.assigned_to_override = body.assigned_to_override ?? null;
    if ("vendor_override" in body) update.vendor_override = body.vendor_override ?? null;
    if ("scheduled_date_override" in body) update.scheduled_date_override = body.scheduled_date_override ?? null;
    if ("tags" in body && Array.isArray(body.tags)) update.tags = body.tags;
    if ("follow_up_on" in body) update.follow_up_on = body.follow_up_on ?? null;

    const appendNote = body.appendNote?.text
      ? { text: String(body.appendNote.text), author: body.appendNote.author }
      : undefined;

    const annotation = await saveAnnotation(id, update, appendNote);
    return NextResponse.json({ ok: true, annotation });
  } catch (error: any) {
    return NextResponse.json(
      { error: error.message || "Failed to save annotation" },
      { status: 500 }
    );
  }
}
