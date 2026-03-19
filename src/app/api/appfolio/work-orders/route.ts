import { NextRequest, NextResponse } from "next/server";
import { fetchMaintenanceRequests } from "@/lib/data";
import { createWorkOrder } from "@/lib/appfolio";

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const { data, source } = await fetchMaintenanceRequests({
      property_id: searchParams.get("property_id") || undefined,
      status: searchParams.get("status") || undefined,
    });
    return NextResponse.json({ workOrders: data, source });
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
