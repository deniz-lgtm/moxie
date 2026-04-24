import { NextRequest, NextResponse } from "next/server";
import { fetchMaintenanceRequests } from "@/lib/data";

// Probe-only helper: POST directly to a report endpoint without going through
// appfolioFetch (which throws on non-2xx). Returns status + short body preview
// so we can identify the correct report name without crashing the whole route.
async function probeReport(report: string, body: Record<string, any>) {
  const dbName = process.env.APPFOLIO_DATABASE_NAME;
  const clientId = process.env.APPFOLIO_CLIENT_ID;
  const clientSecret = process.env.APPFOLIO_CLIENT_SECRET;
  if (!dbName || !clientId || !clientSecret) {
    return { error: "AppFolio credentials not configured" };
  }
  const url = `https://${dbName}.appfolio.com/api/v2/reports/${report}.json`;
  const creds = Buffer.from(`${clientId}:${clientSecret}`).toString("base64");
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Basic ${creds}`,
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify({ paginate_results: true, ...body }),
    });
    const text = await res.text();
    let rowCount: number | null = null;
    let sampleFields: string[] | null = null;
    if (res.ok) {
      try {
        const json = JSON.parse(text);
        rowCount = Array.isArray(json.results) ? json.results.length : null;
        sampleFields = json.results?.[0] ? Object.keys(json.results[0]) : [];
      } catch {
        /* ignore parse error */
      }
    }
    return {
      status: res.status,
      ok: res.ok,
      rowCount,
      sampleFields,
      bodyPreview: text.slice(0, 300),
    };
  } catch (e: any) {
    return { error: e.message };
  }
}

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const debug = searchParams.get("debug") === "1";

    // In debug mode, skip the (currently failing) production fetch and probe
    // candidate report names instead — returns which names the tenant accepts.
    if (debug) {
      const today = new Date();
      const yearAgo = new Date();
      yearAgo.setFullYear(yearAgo.getFullYear() - 1);
      const iso = (d: Date) => d.toISOString().split("T")[0];
      const dateBody = { from_date: iso(yearAgo), to_date: iso(today) };

      const candidates = [
        "work_order",
        "work_order_list",
        "work_order_directory",
        "work_order_detail",
        "work_orders",
        "service_request",
        "service_request_list",
        "maintenance_request",
        "maintenance_requests",
      ];

      const [sanity, ...probes] = await Promise.all([
        probeReport("rent_roll", {}),
        ...candidates.map((c) => probeReport(c, dateBody)),
      ]);

      const candidateResults: Record<string, unknown> = {};
      candidates.forEach((c, i) => { candidateResults[c] = probes[i]; });

      return NextResponse.json({
        note: "Probing report names for work orders. Look for entries where ok=true.",
        sanity_rent_roll: sanity,
        candidates: candidateResults,
      });
    }

    const { data, source } = await fetchMaintenanceRequests(
      {
        property_id: searchParams.get("property_id") || undefined,
        status: searchParams.get("status") || undefined,
      },
      searchParams.get("portfolio_id") || undefined
    );
    return NextResponse.json({ workOrders: data, source });
  } catch (error: any) {
    return NextResponse.json(
      { error: error.message || "Failed to fetch work orders" },
      { status: 500 }
    );
  }
}
