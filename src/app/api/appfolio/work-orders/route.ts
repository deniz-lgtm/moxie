import { NextRequest, NextResponse } from "next/server";
import { getWorkOrders, createWorkOrder } from "@/lib/appfolio";

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const workOrders = await getWorkOrders({
      property_id: searchParams.get("property_id") || undefined,
      status: searchParams.get("status") || undefined,
      created_after: searchParams.get("created_after") || undefined,
    });
    return NextResponse.json({ workOrders });
  } catch (error: any) {
    return NextResponse.json(
      { error: error.message || "Failed to fetch work orders" },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const workOrder = await createWorkOrder(body);
    return NextResponse.json({ workOrder }, { status: 201 });
  } catch (error: any) {
    return NextResponse.json(
      { error: error.message || "Failed to create work order" },
      { status: 500 }
    );
  }
}
