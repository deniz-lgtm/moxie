import { NextResponse } from "next/server";
import { fetchProperties } from "@/lib/data";

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const portfolioId = url.searchParams.get("portfolio_id") || undefined;
    const { data, source } = await fetchProperties(portfolioId);
    return NextResponse.json({ properties: data, source });
  } catch (error: any) {
    return NextResponse.json(
      { error: error.message || "Failed to fetch properties" },
      { status: 500 }
    );
  }
}
