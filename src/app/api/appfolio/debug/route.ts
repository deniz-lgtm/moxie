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

  async function fetchSample(report: string) {
    try {
      const res = await fetch(`${base}/${report}.json?paginate_results=true`, { headers });
      if (!res.ok) return { error: `HTTP ${res.status}` };
      const data = await res.json();
      const rows = data.results || data || [];
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

  const today = new Date();
  const lastYear = new Date();
  lastYear.setFullYear(lastYear.getFullYear() - 1);
  const fmt = (d: Date) =>
    `${String(d.getMonth() + 1).padStart(2, "0")}/${String(d.getDate()).padStart(2, "0")}/${d.getFullYear()}`;

  // Try work orders with different param combos to find what works
  async function fetchWorkOrderAttempts() {
    const attempts: Record<string, any> = {};

    // Attempt 1: from_date + to_date with URLSearchParams
    try {
      const url = new URL(`${base}/work_order_detail.json`);
      url.searchParams.set("paginate_results", "true");
      url.searchParams.set("from_date", fmt(lastYear));
      url.searchParams.set("to_date", fmt(today));
      const res = await fetch(url.toString(), { headers });
      if (!res.ok) {
        const body = await res.text().catch(() => "");
        attempts["from_to_dates"] = { error: `HTTP ${res.status}`, body: body.slice(0, 500) };
      } else {
        const data = await res.json();
        const rows = data.results || [];
        attempts["from_to_dates"] = {
          totalRows: rows.length,
          fields: rows.length > 0 ? Object.keys(rows[0]) : [],
          sample: rows.slice(0, 2),
        };
      }
    } catch (e: any) {
      attempts["from_to_dates"] = { error: e.message };
    }

    // Attempt 2: no date params at all
    try {
      const url2 = new URL(`${base}/work_order_detail.json`);
      url2.searchParams.set("paginate_results", "true");
      const res2 = await fetch(url2.toString(), { headers });
      if (!res2.ok) {
        const body = await res2.text().catch(() => "");
        attempts["no_dates"] = { error: `HTTP ${res2.status}`, body: body.slice(0, 500) };
      } else {
        const data = await res2.json();
        const rows = data.results || [];
        attempts["no_dates"] = {
          totalRows: rows.length,
          fields: rows.length > 0 ? Object.keys(rows[0]) : [],
          sample: rows.slice(0, 2),
        };
      }
    } catch (e: any) {
      attempts["no_dates"] = { error: e.message };
    }

    return attempts;
  }

  const [units, rentRoll, workOrders] = await Promise.all([
    fetchSample("unit_directory"),
    fetchSample("rent_roll"),
    fetchWorkOrderAttempts(),
  ]);

  return NextResponse.json({ units, rentRoll, workOrders });
}
