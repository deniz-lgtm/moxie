import { NextResponse } from "next/server";
import { diagnoseApplications, fetchApplications } from "@/lib/data";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    // ?debug=1 returns the raw AppFolio rental_application_detail
    // response shape + which candidate group-id column actually has
    // values on this account. Use once to pick the right column, then
    // the production path auto-detects.
    if (url.searchParams.get("debug")) {
      const diag = await diagnoseApplications();
      return NextResponse.json(diag);
    }
    const portfolioId = url.searchParams.get("portfolio_id") || undefined;
    const { data, source } = await fetchApplications(portfolioId);
    return NextResponse.json({ applications: data, source });
  } catch (error: any) {
    return NextResponse.json(
      {
        error: error.message || "Failed to fetch applications",
        stack: error.stack?.split("\n").slice(0, 5),
      },
      { status: 500 }
    );
  }
}
