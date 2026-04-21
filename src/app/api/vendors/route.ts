import { NextRequest, NextResponse } from "next/server";
import { listVendors, upsertVendor, deleteVendor } from "@/lib/vendors-db";
import type { Vendor } from "@/lib/types";

export async function GET() {
  try {
    const vendors = await listVendors();
    return NextResponse.json({ vendors });
  } catch (error: any) {
    return NextResponse.json({ error: error.message || "Failed to fetch" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const vendor = body.vendor as Partial<Vendor> | undefined;
    if (!vendor?.name || !vendor?.id) {
      return NextResponse.json({ error: "Missing id or name" }, { status: 400 });
    }
    const saved = await upsertVendor({
      id: vendor.id,
      name: vendor.name,
      category: vendor.category,
      scope: vendor.scope,
      phone: vendor.phone,
      email: vendor.email,
      website: vendor.website,
      address: vendor.address,
      contactName: vendor.contactName,
      licenseNumber: vendor.licenseNumber,
      insuranceExpiry: vendor.insuranceExpiry,
      status: vendor.status,
      rating: vendor.rating,
      notes: vendor.notes,
      isInternal: vendor.isInternal ?? false,
      notionPageId: vendor.notionPageId,
      notionLastSyncedAt: vendor.notionLastSyncedAt,
      createdAt: vendor.createdAt ?? new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });
    return NextResponse.json({ ok: true, vendor: saved });
  } catch (error: any) {
    return NextResponse.json({ error: error.message || "Failed to save" }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const id = request.nextUrl.searchParams.get("id");
    if (!id) return NextResponse.json({ error: "Missing id" }, { status: 400 });
    await deleteVendor(id);
    return NextResponse.json({ ok: true });
  } catch (error: any) {
    return NextResponse.json({ error: error.message || "Failed to delete" }, { status: 500 });
  }
}
