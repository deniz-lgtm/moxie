import { NextResponse } from "next/server";
import { getMeterMappings, saveMeterMapping, deleteMeterMapping } from "@/lib/rubs-db";
import type { MeterMapping } from "@/lib/rubs-types";

export async function GET() {
  try {
    const mappings = getMeterMappings();
    return NextResponse.json({ mappings });
  } catch (error: any) {
    return NextResponse.json({ error: error.message || "Failed to fetch mappings" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const mapping = body.mapping as MeterMapping;
    if (!mapping || !mapping.id || !mapping.propertyName) {
      return NextResponse.json({ error: "Missing required mapping fields" }, { status: 400 });
    }
    saveMeterMapping(mapping);
    return NextResponse.json({ ok: true, mapping });
  } catch (error: any) {
    return NextResponse.json({ error: error.message || "Failed to save mapping" }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  try {
    const url = new URL(request.url);
    const id = url.searchParams.get("id");
    if (!id) {
      return NextResponse.json({ error: "Missing id parameter" }, { status: 400 });
    }
    deleteMeterMapping(id);
    return NextResponse.json({ ok: true });
  } catch (error: any) {
    return NextResponse.json({ error: error.message || "Failed to delete mapping" }, { status: 500 });
  }
}
