import { NextResponse } from "next/server";
import {
  deleteUnitOverride,
  getUnitOverride,
  listUnitOverrides,
  upsertUnitOverride,
} from "@/lib/unit-overrides-db";

/**
 * GET /api/units/overrides
 *   ?appfolio_unit_id=<id>   one override
 *   (no params)              all overrides
 */
export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const id = url.searchParams.get("appfolio_unit_id");
    if (id) {
      const override = await getUnitOverride(id);
      if (!override) {
        return NextResponse.json({ override: null });
      }
      return NextResponse.json({ override });
    }
    const overrides = await listUnitOverrides();
    return NextResponse.json({ overrides });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

/**
 * PUT /api/units/overrides
 *
 * Body: { appfolio_unit_id, display_name?, notes?, custom_fields? }
 * Upsert keyed by appfolio_unit_id.
 */
export async function PUT(request: Request) {
  try {
    const body = await request.json();
    if (!body?.appfolio_unit_id) {
      return NextResponse.json(
        { error: "Missing appfolio_unit_id" },
        { status: 400 }
      );
    }
    const override = await upsertUnitOverride({
      appfolioUnitId: String(body.appfolio_unit_id),
      ...("display_name" in body ? { displayName: body.display_name ?? null } : {}),
      ...("notes" in body ? { notes: body.notes ?? null } : {}),
      ...("custom_fields" in body
        ? {
            customFields:
              body.custom_fields && typeof body.custom_fields === "object"
                ? (body.custom_fields as Record<string, unknown>)
                : {},
          }
        : {}),
    });
    return NextResponse.json({ override });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

/** DELETE /api/units/overrides?appfolio_unit_id=<id> */
export async function DELETE(request: Request) {
  try {
    const url = new URL(request.url);
    const id = url.searchParams.get("appfolio_unit_id");
    if (!id) {
      return NextResponse.json({ error: "Missing appfolio_unit_id" }, { status: 400 });
    }
    await deleteUnitOverride(id);
    return NextResponse.json({ ok: true });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
