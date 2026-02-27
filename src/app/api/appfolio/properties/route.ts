import { NextResponse } from "next/server";
import { getProperties } from "@/lib/appfolio";

export async function GET() {
  try {
    const properties = await getProperties();
    return NextResponse.json({ properties });
  } catch (error: any) {
    return NextResponse.json(
      { error: error.message || "Failed to fetch properties from AppFolio" },
      { status: 500 }
    );
  }
}
