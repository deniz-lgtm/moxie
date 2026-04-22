import { NextResponse } from "next/server";
import {
  getPropertyAttribute,
  listPropertyAttributes,
  upsertPropertyAttribute,
} from "@/lib/property-attributes-db";
import type { PropertyAttribute } from "@/lib/types";

export const dynamic = "force-dynamic";

/**
 * GET /api/properties/attributes
 *   (no params) → list all
 *   ?property_id=X → single record
 */
export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const propertyId = url.searchParams.get("property_id");
    if (propertyId) {
      const a = await getPropertyAttribute(propertyId);
      return NextResponse.json({ attribute: a });
    }
    const attributes = await listPropertyAttributes();
    return NextResponse.json({ attributes });
  } catch (error: any) {
    return NextResponse.json({ error: error.message || "Failed" }, { status: 500 });
  }
}

/** POST /api/properties/attributes — upsert a PropertyAttribute. */
export async function POST(request: Request) {
  try {
    const body = await request.json();
    if (!body?.propertyId || typeof body.propertyId !== "string") {
      return NextResponse.json({ error: "Missing propertyId" }, { status: 400 });
    }
    const attr: PropertyAttribute = {
      propertyId: String(body.propertyId),
      insuranceCarrier: body.insuranceCarrier ?? undefined,
      insurancePolicyNumber: body.insurancePolicyNumber ?? undefined,
      insuranceExpires: body.insuranceExpires ?? undefined,
      insurancePremiumAnnual:
        body.insurancePremiumAnnual != null && body.insurancePremiumAnnual !== ""
          ? Number(body.insurancePremiumAnnual)
          : undefined,
      taxApn: body.taxApn ?? undefined,
      taxAnnualAmount:
        body.taxAnnualAmount != null && body.taxAnnualAmount !== ""
          ? Number(body.taxAnnualAmount)
          : undefined,
      taxNextInstallmentDue: body.taxNextInstallmentDue ?? undefined,
      taxYtdPaid:
        body.taxYtdPaid != null && body.taxYtdPaid !== "" ? Number(body.taxYtdPaid) : undefined,
      notes: body.notes ?? undefined,
    };
    const saved = await upsertPropertyAttribute(attr);
    return NextResponse.json({ attribute: saved });
  } catch (error: any) {
    return NextResponse.json({ error: error.message || "Failed" }, { status: 500 });
  }
}
