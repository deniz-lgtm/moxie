import { NextResponse } from "next/server";
import { getBillById, getMeterMappingById, saveBill } from "@/lib/rubs-db";
import { calculateAllocations } from "@/lib/rubs-calc";
import type { SplitMethod } from "@/lib/rubs-types";
import type { Unit } from "@/lib/types";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { billId, splitMethod, units } = body as {
      billId: string;
      splitMethod?: SplitMethod;
      units: Unit[];
    };

    if (!billId) {
      return NextResponse.json({ error: "Missing billId" }, { status: 400 });
    }
    if (!Array.isArray(units) || units.length === 0) {
      return NextResponse.json(
        { error: "Missing units array — cannot allocate a bill with no unit data" },
        { status: 400 },
      );
    }

    const bill = await getBillById(billId);
    if (!bill) {
      return NextResponse.json({ error: "Bill not found" }, { status: 404 });
    }
    if (bill.status === "posted") {
      return NextResponse.json(
        { error: "Bill has already been posted to AppFolio — recalculating would desync charges" },
        { status: 409 },
      );
    }

    const mapping = await getMeterMappingById(bill.mappingId);
    if (!mapping) {
      return NextResponse.json({ error: "Meter mapping not found for this bill" }, { status: 404 });
    }

    const allocations = calculateAllocations({
      totalAmount: bill.totalAmount,
      mapping,
      units,
      splitMethod,
    });
    if (allocations.length === 0) {
      // None of the mapping's unitIds matched the provided units — saving a
      // "calculated" bill with zero allocations would silently bill nobody.
      return NextResponse.json(
        { error: "No units matched this meter mapping; check the mapping's unit assignments" },
        { status: 422 },
      );
    }

    // Update the bill with calculated allocations
    const updatedBill = {
      ...bill,
      allocations,
      status: "calculated" as const,
      updatedAt: new Date().toISOString(),
    };
    await saveBill(updatedBill);

    return NextResponse.json({ ok: true, bill: updatedBill });
  } catch (error: any) {
    return NextResponse.json({ error: error.message || "Failed to calculate" }, { status: 500 });
  }
}
