import { NextResponse } from "next/server";
import {
  deletePnlLineItem,
  listPnlLineItems,
  upsertPnlLineItem,
} from "@/lib/property-pnl-db";
import type { PropertyPnlLineItem } from "@/lib/types";

export const dynamic = "force-dynamic";

function normalizeMonth(input: unknown): string | null {
  if (typeof input !== "string" || !input) return null;
  // Accept YYYY-MM or YYYY-MM-DD; store as YYYY-MM-01.
  const m = input.match(/^(\d{4})-(\d{2})/);
  return m ? `${m[1]}-${m[2]}-01` : null;
}

/**
 * GET /api/properties/pnl
 *   ?property_id=X          line items for one property
 *   ?month=YYYY-MM          limit to one month
 *   ?month_from + ?month_to range scan
 */
export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const items = await listPnlLineItems({
      propertyId: url.searchParams.get("property_id") || undefined,
      month: normalizeMonth(url.searchParams.get("month")) || undefined,
      monthFrom: normalizeMonth(url.searchParams.get("month_from")) || undefined,
      monthTo: normalizeMonth(url.searchParams.get("month_to")) || undefined,
    });
    return NextResponse.json({ items });
  } catch (error: any) {
    return NextResponse.json({ error: error.message || "Failed" }, { status: 500 });
  }
}

/**
 * POST /api/properties/pnl — upsert by (property_id, month, category).
 *
 * Body: PropertyPnlLineItem
 */
export async function POST(request: Request) {
  try {
    const body = await request.json();
    if (!body?.propertyId || !body?.month || !body?.category) {
      return NextResponse.json(
        { error: "Missing propertyId / month / category" },
        { status: 400 }
      );
    }
    const month = normalizeMonth(body.month);
    if (!month) {
      return NextResponse.json({ error: "Invalid month (expect YYYY-MM)" }, { status: 400 });
    }
    const item: PropertyPnlLineItem = {
      id: String(body.id || `pnl_${body.propertyId}_${month}_${body.category}`),
      propertyId: String(body.propertyId),
      month,
      category: String(body.category),
      amount: Number(body.amount) || 0,
      notes: body.notes ?? undefined,
    };
    const saved = await upsertPnlLineItem(item);
    return NextResponse.json({ item: saved });
  } catch (error: any) {
    return NextResponse.json({ error: error.message || "Failed" }, { status: 500 });
  }
}

/** DELETE /api/properties/pnl?id=<id> */
export async function DELETE(request: Request) {
  try {
    const url = new URL(request.url);
    const id = url.searchParams.get("id");
    if (!id) return NextResponse.json({ error: "Missing id" }, { status: 400 });
    await deletePnlLineItem(id);
    return NextResponse.json({ ok: true });
  } catch (error: any) {
    return NextResponse.json({ error: error.message || "Failed" }, { status: 500 });
  }
}
