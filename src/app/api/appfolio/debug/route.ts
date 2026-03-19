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
  const base = `https://${dbName}.appfolio.com/api/v1/reports`;

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
        const key = `${r.PortfolioId || "null"}|${r.PropertyGroupId || "null"}`;
        if (!seen.has(key)) {
          seen.set(key, {
            PortfolioId: r.PortfolioId,
            PropertyGroupId: r.PropertyGroupId,
            PropertyName: r.PropertyName,
            PropertyType: r.PropertyType,
          });
        }
      }
      portfolios = Array.from(seen.values());
    }
  } catch { /* ignore */ }

  return NextResponse.json({
    portfolios,
    rentRoll,
    vacancy_as_of_aug15: vacancy815,
    workOrders,
    properties,
  });
}
