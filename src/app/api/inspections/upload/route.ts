import { NextResponse } from "next/server";
import { uploadPhoto, uploadFloorPlan } from "@/lib/inspections-db";

const MAX_PAYLOAD_BYTES = 10 * 1024 * 1024; // 10MB base64 payload limit

/** POST /api/inspections/upload — upload a photo or floor plan to Supabase Storage */
export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { dataUrl, inspectionId, photoId, type } = body;

    if (!dataUrl || !inspectionId) {
      return NextResponse.json({ error: "Missing dataUrl or inspectionId" }, { status: 400 });
    }

    // Server-side size check on the base64 payload
    if (typeof dataUrl === "string" && dataUrl.length > MAX_PAYLOAD_BYTES) {
      return NextResponse.json(
        { error: "Image too large. Please compress before uploading." },
        { status: 413 },
      );
    }

    let publicUrl: string;
    if (type === "floor_plan") {
      publicUrl = await uploadFloorPlan(dataUrl, inspectionId);
    } else {
      publicUrl = await uploadPhoto(dataUrl, inspectionId, photoId || "photo");
    }

    return NextResponse.json({ url: publicUrl });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
