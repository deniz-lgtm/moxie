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

  async function fetchAllPages(report: string, params?: Record<string, string>) {
    const url = new URL(`${base}/${report}.json`);
    url.searchParams.set("paginate_results", "true");
    if (params) {
      for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
    }
    const res = await fetch(url.toString(), { headers });
    if (!res.ok) return [];
    const data = await res.json();
    let rows = data.results || [];
    let nextPage = data.next_page_url;
    while (nextPage) {
      const np = await fetch(nextPage, { headers });
      if (!np.ok) break;
      const npd = await np.json();
      rows = rows.concat(npd.results || []);
      nextPage = npd.next_page_url;
    }
    return rows;
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

  // Extract unique portfolios from property_directory for discovery
  // v2: property_directory has `portfolio` field; rent_roll does NOT
  let portfolios: any[] = [];
  try {
    const propRows = await fetchAllPages("property_directory");
    const seen = new Map<string, any>();
    for (const r of propRows) {
      const key = String(r.portfolio || "null");
      if (!seen.has(key)) {
        seen.set(key, {
          portfolio: r.portfolio,
          property: r.property,
          property_name: r.property_name,
          property_type: r.property_type,
        });
      }
    }
    portfolios = Array.from(seen.values());
  } catch { /* ignore */ }

  // Cross-reference diagnostic: find Moxie properties and match against rent roll
  let crossRef: any = {};
  try {
    const propRows = await fetchAllPages("property_directory");
    const rrRows = await fetchAllPages("rent_roll");

    // v2: Property Directory has `portfolio` field with portfolio name
    const moxieProps = propRows.filter((p: any) => {
      const portfolio = String(p.portfolio || "");
      return portfolio.toLowerCase().includes("moxie");
    });
    // v2: Property identifier is `property` field
    const moxiePropertyRefs = moxieProps.map((p: any) => String(p.property || ""));

    // v2: Rent Roll uses `property` field to reference which property
    const rrPropertyRefs = [...new Set(rrRows.map((r: any) => String(r.property || "")))];

    // Find rent roll rows that match Moxie properties
    const moxieRefSet = new Set(moxiePropertyRefs);
    const matchingRrRows = rrRows.filter((r: any) => moxieRefSet.has(String(r.property || "")));

    crossRef = {
      apiVersion: "v2",
      propertyDirectoryTotal: propRows.length,
      moxiePropertiesCount: moxieProps.length,
      moxiePropertyRefs: moxiePropertyRefs.slice(0, 20),
      moxieSampleRows: moxieProps.slice(0, 3).map((p: any) => ({
        property: p.property,
        property_name: p.property_name,
        property_address: p.property_address,
        portfolio: p.portfolio,
        units: p.units,
      })),
      rentRollTotal: rrRows.length,
      rentRollUniquePropertyRefs: rrPropertyRefs.slice(0, 20),
      rentRollSampleRow: rrRows.length > 0 ? Object.fromEntries(
        Object.entries(rrRows[0]).filter(([k]) =>
          ["property", "property_name", "unit", "tenant", "status", "rent", "bd_ba"].includes(k)
        )
      ) : {},
      matchingRentRollRows: matchingRrRows.length,
      portfolioFieldsInPropDir: propRows.length > 0
        ? Object.keys(propRows[0]).filter((k: string) => /portfolio|group/i.test(k))
        : [],
      filteringStrategy: "property_directory.portfolio → Moxie property refs → filter other reports by property field",
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
