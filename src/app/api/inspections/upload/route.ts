import { NextResponse } from "next/server";
import { uploadPhoto, uploadFloorPlan } from "@/lib/inspections-db";

/** POST /api/inspections/upload — upload a photo or floor plan to Supabase Storage */
export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { dataUrl, inspectionId, photoId, type } = body;

    if (!dataUrl || !inspectionId) {
      return NextResponse.json({ error: "Missing dataUrl or inspectionId" }, { status: 400 });
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
