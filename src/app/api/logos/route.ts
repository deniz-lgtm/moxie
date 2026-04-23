import { NextResponse } from "next/server";
import { getSupabase } from "@/lib/supabase";

const BUCKET = "inspection-files";

// POST /api/logos
// Body: { dataUrl: string, slot: "moxie" | "vendor", vendorId?: string }
// Uploads to Supabase storage and returns { url }.
export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { dataUrl, slot, vendorId } = body as {
      dataUrl: string;
      slot: "moxie" | "vendor";
      vendorId?: string;
    };

    if (!dataUrl || !slot) {
      return NextResponse.json({ error: "Missing dataUrl or slot" }, { status: 400 });
    }

    const sb = getSupabase();
    if (!sb) {
      return NextResponse.json({ error: "Storage not configured" }, { status: 503 });
    }

    const res = await fetch(dataUrl);
    const blob = await res.blob();
    const ext = blob.type.includes("png") ? "png" : blob.type.includes("svg") ? "svg" : "png";

    const filename =
      slot === "moxie"
        ? `logos/moxie-logo.${ext}`
        : `logos/vendor-${vendorId ?? "unknown"}.${ext}`;

    const { error: uploadError } = await sb.storage
      .from(BUCKET)
      .upload(filename, blob, { contentType: blob.type, upsert: true });

    if (uploadError) {
      return NextResponse.json({ error: uploadError.message }, { status: 500 });
    }

    const {
      data: { publicUrl },
    } = sb.storage.from(BUCKET).getPublicUrl(filename);

    return NextResponse.json({ url: publicUrl });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
