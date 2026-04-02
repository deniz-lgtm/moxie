import { NextResponse } from "next/server";
import { getBillById } from "@/lib/rubs-db";

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const billId = url.searchParams.get("billId");

    if (!billId) {
      return NextResponse.json({ error: "Missing billId parameter" }, { status: 400 });
    }

    const bill = getBillById(billId);
    if (!bill) {
      return NextResponse.json({ error: "Bill not found" }, { status: 404 });
    }

    // Build CSV
    const headers = ["Unit", "Tenant", "Sq Ft", "Occupants", "Share %", "Amount"];
    const rows = bill.allocations.map((a) => [
      a.unitName,
      a.tenant,
      a.sqft.toString(),
      a.occupants.toString(),
      (a.share * 100).toFixed(1),
      a.amount.toFixed(2),
    ]);

    // Add total row
    const totalAmount = bill.allocations.reduce((sum, a) => sum + a.amount, 0);
    rows.push(["TOTAL", "", "", "", "100.0", totalAmount.toFixed(2)]);

    const csv = [
      `# ${bill.propertyName} - ${bill.meterType.toUpperCase()} - ${bill.month}`,
      `# Total Bill: $${bill.totalAmount.toFixed(2)}`,
      "",
      headers.join(","),
      ...rows.map((r) => r.map((cell) => `"${cell}"`).join(",")),
    ].join("\n");

    return new NextResponse(csv, {
      headers: {
        "Content-Type": "text/csv",
        "Content-Disposition": `attachment; filename="rubs-${bill.propertyName.replace(/\s/g, "-")}-${bill.meterType}-${bill.month}.csv"`,
      },
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message || "Failed to export" }, { status: 500 });
  }
}
