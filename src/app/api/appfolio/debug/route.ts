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

  const [units, workOrders] = await Promise.all([
    fetchSample("unit_directory"),
    fetchSample("work_order_detail"),
  ]);

  return NextResponse.json({ units, workOrders });
}
