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

    const bill = getBillById(billId);
    if (!bill) {
      return NextResponse.json({ error: "Bill not found" }, { status: 404 });
    }

    const mapping = getMeterMappingById(bill.mappingId);
    if (!mapping) {
      return NextResponse.json({ error: "Meter mapping not found for this bill" }, { status: 404 });
    }

    const allocations = calculateAllocations({
      totalAmount: bill.totalAmount,
      mapping,
      units: units || [],
      splitMethod,
    });

    // Update the bill with calculated allocations
    const updatedBill = {
      ...bill,
      allocations,
      status: "calculated" as const,
      updatedAt: new Date().toISOString(),
    };
    saveBill(updatedBill);

    return NextResponse.json({ ok: true, bill: updatedBill });
  } catch (error: any) {
    return NextResponse.json({ error: error.message || "Failed to calculate" }, { status: 500 });
  }
}
