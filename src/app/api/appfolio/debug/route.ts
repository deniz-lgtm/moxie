import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function GET() {
  const clientId = process.env.APPFOLIO_CLIENT_ID;
  const clientSecret = process.env.APPFOLIO_CLIENT_SECRET;
  const dbName = process.env.APPFOLIO_DATABASE_NAME;

  if (!clientId || !clientSecret || !dbName) {
    return NextResponse.json({ error: "AppFolio not configured" }, { status: 500 });
  }

  const credentials = Buffer.from(`${clientId}:${clientSecret}`).toString("base64");
  const headers = { Authorization: `Basic ${credentials}`, Accept: "application/json" };
  const base = `https://${dbName}.appfolio.com/api/v2/reports`;

  async function fetchReport(report: string, params?: Record<string, string>) {
    try {
      const url = new URL(`${base}/${report}.json`);
      url.searchParams.set("paginate_results", "true");
      if (params) {
        for (const [k, v] of Object.entries(params)) {
          url.searchParams.set(k, v);
        }
      }
      const res = await fetch(url.toString(), { headers });
      if (!res.ok) {
        const body = await res.text().catch(() => "");
        return { error: `HTTP ${res.status}`, body: body.slice(0, 500) };
      }
      const data = await res.json();
      const rows = data.results || [];
      return {
        totalRows: rows.length,
        nextPage: !!data.next_page_url,
        fields: rows.length > 0 ? Object.keys(rows[0]) : [],
        sample: rows.slice(0, 3),
      };
    } catch (e: any) {
      return { error: e.message };
    }
  }

  // Fetch all reports in parallel
  const [rentRoll, vacancy815, workOrders, properties] = await Promise.all([
    fetchReport("rent_roll"),
    fetchReport("unit_vacancy_detail", { as_of_date: "08/15/2026" }),
    fetchReport("work_order_detail", {
      from_date: "03/19/2025",
      to_date: "03/19/2026",
    }),
    fetchReport("property_directory"),
  ]);

  // Extract unique portfolios from rent roll for discovery
  let portfolios: any[] = [];
  try {
    const url = new URL(`${base}/rent_roll.json`);
    url.searchParams.set("paginate_results", "true");
    const res = await fetch(url.toString(), { headers });
    if (res.ok) {
      const data = await res.json();
      const rows = data.results || [];
      const seen = new Map<string, any>();
      for (const r of rows) {
        // v2 snake_case field names
        const key = `${r.portfolio_id || "null"}|${r.property_group_id || "null"}`;
        if (!seen.has(key)) {
          seen.set(key, {
            portfolio_id: r.portfolio_id,
            property_group_id: r.property_group_id,
            property_name: r.property_name,
            property_type: r.property_type,
          });
        }
      }
      portfolios = Array.from(seen.values());
    }
  } catch { /* ignore */ }

  // Cross-reference diagnostic: compare property_ids between property_directory and rent_roll
  let crossRef: any = {};
  try {
    // Fetch all property_directory rows
    const propUrl = new URL(`${base}/property_directory.json`);
    propUrl.searchParams.set("paginate_results", "true");
    const propRes = await fetch(propUrl.toString(), { headers });
    const propData = propRes.ok ? await propRes.json() : { results: [] };
    let propRows = propData.results || [];
    let nextPage = propData.next_page_url;
    while (nextPage) {
      const np = await fetch(nextPage, { headers });
      if (!np.ok) break;
      const npd = await np.json();
      propRows = propRows.concat(npd.results || []);
      nextPage = npd.next_page_url;
    }

    // Fetch all rent_roll rows
    const rrUrl = new URL(`${base}/rent_roll.json`);
    rrUrl.searchParams.set("paginate_results", "true");
    const rrRes = await fetch(rrUrl.toString(), { headers });
    const rrData = rrRes.ok ? await rrRes.json() : { results: [] };
    let rrRows = rrData.results || [];
    let rrNext = rrData.next_page_url;
    while (rrNext) {
      const np = await fetch(rrNext, { headers });
      if (!np.ok) break;
      const npd = await np.json();
      rrRows = rrRows.concat(npd.results || []);
      rrNext = npd.next_page_url;
    }

    // Find Moxie properties in property_directory (v2 snake_case)
    const moxieProps = propRows.filter((p: any) => {
      const portfolio = String(p.portfolio || p.portfolio_name || p.property_group_name || "");
      return portfolio === "Moxie Management";
    });
    const moxiePropertyIds = moxieProps.map((p: any) => String(p.property_id || ""));

    // Find unique property_ids in rent roll
    const rrPropertyIds = [...new Set(rrRows.map((r: any) => String(r.property_id || "")))];

    // Find matches
    const moxieIdSet = new Set(moxiePropertyIds);
    const matchingRrRows = rrRows.filter((r: any) => moxieIdSet.has(String(r.property_id || "")));

    crossRef = {
      apiVersion: "v2",
      propertyDirectoryTotal: propRows.length,
      moxiePropertiesCount: moxieProps.length,
      moxiePropertyIds: moxiePropertyIds.slice(0, 20),
      moxieSampleRows: moxieProps.slice(0, 3).map((p: any) => ({
        property_id: p.property_id,
        property_address: p.property_address,
        portfolio: p.portfolio,
        portfolio_name: p.portfolio_name,
        property_group_name: p.property_group_name,
      })),
      rentRollTotal: rrRows.length,
      rentRollUniquePropertyIds: rrPropertyIds.slice(0, 20),
      rentRollSampleRow: rrRows.length > 0 ? Object.fromEntries(
        Object.entries(rrRows[0]).filter(([k]) =>
          ["property_id", "property_name", "portfolio_id", "portfolio", "portfolio_name"].includes(k)
        )
      ) : {},
      matchingRentRollRows: matchingRrRows.length,
      portfolioFieldsInPropDir: propRows.length > 0
        ? Object.keys(propRows[0]).filter((k: string) => /portfolio|group/i.test(k))
        : [],
    };
  } catch (e: any) {
    crossRef = { error: e.message };
  }

  return NextResponse.json({
    crossRef,
    portfolios,
    rentRoll,
    vacancy_as_of_aug15: vacancy815,
    workOrders,
    properties,
  });
}
