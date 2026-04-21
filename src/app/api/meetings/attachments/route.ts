import { NextResponse } from "next/server";
import { deleteAttachment, uploadAttachment } from "@/lib/meetings-db";

const MAX_PAYLOAD_BYTES = 15 * 1024 * 1024; // ~11MB actual file after base64 overhead

/**
 * POST /api/meetings/attachments
 *
 * Body:
 * {
 *   item_id: string,
 *   name: string,
 *   content_type: string,
 *   size: number,
 *   data_url: string,    // base64 data URL
 *   uploaded_by?: string
 * }
 */
export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { item_id, name, content_type, size, data_url, uploaded_by } = body || {};
    if (!item_id || !name || !data_url) {
      return NextResponse.json(
        { error: "Missing item_id / name / data_url" },
        { status: 400 }
      );
    }
    if (typeof data_url === "string" && data_url.length > MAX_PAYLOAD_BYTES) {
      return NextResponse.json(
        { error: "File too large (15MB limit)." },
        { status: 413 }
      );
    }

    const item = await uploadAttachment(
      String(item_id),
      {
        name: String(name),
        contentType: String(content_type || "application/octet-stream"),
        size: Number(size) || 0,
        dataUrl: String(data_url),
      },
      uploaded_by ? String(uploaded_by) : undefined
    );
    return NextResponse.json({ item });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

/** DELETE /api/meetings/attachments?item_id=<id>&attachment_id=<id> */
export async function DELETE(request: Request) {
  try {
    const url = new URL(request.url);
    const itemId = url.searchParams.get("item_id");
    const attachmentId = url.searchParams.get("attachment_id");
    if (!itemId || !attachmentId) {
      return NextResponse.json({ error: "Missing item_id or attachment_id" }, { status: 400 });
    }
    const item = await deleteAttachment(itemId, attachmentId);
    return NextResponse.json({ item });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
