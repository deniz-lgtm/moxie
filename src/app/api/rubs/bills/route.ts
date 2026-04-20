import { NextResponse } from "next/server";
import { getBillsFiltered, saveBill, deleteBill } from "@/lib/rubs-db";
import type { RubsBill } from "@/lib/rubs-types";

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const month = url.searchParams.get("month") || undefined;
    const propertyName = url.searchParams.get("property") || undefined;
    const bills = await getBillsFiltered({ month, propertyName });
    return NextResponse.json({ bills });
  } catch (error: any) {
    return NextResponse.json({ error: error.message || "Failed to fetch bills" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const bill = body.bill as RubsBill;
    if (!bill || !bill.id || !bill.propertyName) {
      return NextResponse.json({ error: "Missing required bill fields" }, { status: 400 });
    }
    await saveBill(bill);
    return NextResponse.json({ ok: true, bill });
  } catch (error: any) {
    return NextResponse.json({ error: error.message || "Failed to save bill" }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  try {
    const url = new URL(request.url);
    const id = url.searchParams.get("id");
    if (!id) {
      return NextResponse.json({ error: "Missing id parameter" }, { status: 400 });
    }
    await deleteBill(id);
    return NextResponse.json({ ok: true });
  } catch (error: any) {
    return NextResponse.json({ error: error.message || "Failed to delete bill" }, { status: 500 });
  }
}
