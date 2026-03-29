import { NextResponse } from "next/server";
import {
  fetchInspections,
  saveInspectionToDb,
  deleteInspectionFromDb,
  bulkCreateInspections,
  getExistingUnitIds,
} from "@/lib/inspections-db";
import type { InspectionType } from "@/lib/types";

/** GET /api/inspections/crud?type=move_out */
export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const type = (url.searchParams.get("type") || "move_out") as InspectionType;

    // If ?existing_unit_ids=1, return just the set of unit IDs that already have inspections
    if (url.searchParams.get("existing_unit_ids")) {
      const ids = await getExistingUnitIds(type);
      return NextResponse.json({ unitIds: [...ids] });
    }

    const inspections = await fetchInspections(type);
    return NextResponse.json({ inspections });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

/** POST /api/inspections/crud — upsert one or bulk create */
export async function POST(request: Request) {
  try {
    const body = await request.json();

    // Bulk create: { inspections: [...] }
    if (body.inspections && Array.isArray(body.inspections)) {
      await bulkCreateInspections(body.inspections);
      return NextResponse.json({ ok: true, count: body.inspections.length });
    }

    // Single upsert: { inspection: {...} }
    if (body.inspection) {
      await saveInspectionToDb(body.inspection);
      return NextResponse.json({ ok: true });
    }

    return NextResponse.json({ error: "Missing inspection or inspections" }, { status: 400 });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

/** DELETE /api/inspections/crud?id=<uuid> */
export async function DELETE(request: Request) {
  try {
    const url = new URL(request.url);
    const id = url.searchParams.get("id");
    if (!id) {
      return NextResponse.json({ error: "Missing id" }, { status: 400 });
    }
    await deleteInspectionFromDb(id);
    return NextResponse.json({ ok: true });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
