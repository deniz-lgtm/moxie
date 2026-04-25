import { NextResponse } from "next/server";
import { getSupabase } from "@/lib/supabase";
import { analyzeFloorPlan } from "@/lib/ai-analysis";

const BUCKET = "inspection-files";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const unitId = searchParams.get("unit_id");
  const unitName = searchParams.get("unit_name");
  const propertyName = searchParams.get("property_name");

  const sb = getSupabase();
  if (!sb) {
    return NextResponse.json({ floor_plans: [] });
  }

  let query = sb
    .from("floor_plans")
    .select("*")
    .order("created_at", { ascending: false });

  if (unitId) query = query.eq("unit_id", unitId);
  else if (unitName) query = query.eq("unit_name", unitName);
  else if (propertyName) query = query.eq("property_name", propertyName);

  const { data, error } = await query;
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ floor_plans: data || [] });
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { dataUrl, propertyName, unitId, unitName, label } = body;

    if (!dataUrl || !unitName || !propertyName) {
      return NextResponse.json({ error: "Missing required fields: dataUrl, unitName, propertyName" }, { status: 400 });
    }

    const sb = getSupabase();
    if (!sb) {
      return NextResponse.json({ error: "Storage not configured" }, { status: 503 });
    }

    const res = await fetch(dataUrl);
    const blob = await res.blob();
    const ext = blob.type.includes("png")
      ? "png"
      : blob.type.includes("pdf")
      ? "pdf"
      : "jpg";
    const safeName = (unitId || unitName).replace(/[^a-zA-Z0-9]/g, "_");
    const path = `floor-plans/${safeName}-${Date.now()}.${ext}`;

    const { error: uploadError } = await sb.storage.from(BUCKET).upload(path, blob, {
      contentType: blob.type,
      upsert: true,
    });
    if (uploadError) {
      return NextResponse.json({ error: uploadError.message }, { status: 500 });
    }

    const { data: { publicUrl } } = sb.storage.from(BUCKET).getPublicUrl(path);

    // Run AI room detection on raster uploads. PDFs can't be passed to
    // Claude's image API so we leave rooms empty — the PM can fill them
    // in via the Floor Plans Library room editor.
    let rooms: string[] = [];
    if (ext !== "pdf") {
      try {
        rooms = await analyzeFloorPlan(dataUrl);
      } catch {
        rooms = [];
      }
    }

    const { data, error } = await sb
      .from("floor_plans")
      .insert({
        property_name: propertyName,
        unit_id: unitId || null,
        unit_name: unitName,
        label: label || "Floor Plan",
        storage_url: publicUrl,
        rooms,
      })
      .select()
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    return NextResponse.json({ floor_plan: data });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
  try {
    const body = await request.json();
    const { id, rooms, label } = body;
    if (!id) {
      return NextResponse.json({ error: "Missing id" }, { status: 400 });
    }

    const sb = getSupabase();
    if (!sb) {
      return NextResponse.json({ error: "Storage not configured" }, { status: 503 });
    }

    const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };
    if (Array.isArray(rooms)) updates.rooms = rooms;
    if (typeof label === "string") updates.label = label;

    const { data, error } = await sb
      .from("floor_plans")
      .update(updates)
      .eq("id", id)
      .select()
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    return NextResponse.json({ floor_plan: data });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  const { searchParams } = new URL(request.url);
  const id = searchParams.get("id");

  if (!id) {
    return NextResponse.json({ error: "Missing id" }, { status: 400 });
  }

  const sb = getSupabase();
  if (!sb) {
    return NextResponse.json({ error: "Storage not configured" }, { status: 503 });
  }

  const { error } = await sb.from("floor_plans").delete().eq("id", id);
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ success: true });
}
