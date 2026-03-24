import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

/**
 * Diagnostic endpoint: fetches raw AppFolio v2 data and shows actual field names
 * and values so we can see exactly what's coming back from the API.
 *
 * Usage: /api/appfolio/raw-fields
 */
export async function GET() {
  const clientId = process.env.APPFOLIO_CLIENT_ID;
  const clientSecret = process.env.APPFOLIO_CLIENT_SECRET;
  const dbName = process.env.APPFOLIO_DATABASE_NAME;

  if (!clientId || !clientSecret || !dbName) {
    return NextResponse.json({ error: "AppFolio not configured", env: {
      APPFOLIO_CLIENT_ID: clientId ? "set" : "MISSING",
      APPFOLIO_CLIENT_SECRET: clientSecret ? "set" : "MISSING",
      APPFOLIO_DATABASE_NAME: dbName || "MISSING",
    }}, { status: 500 });
  }

  const credentials = Buffer.from(`${clientId}:${clientSecret}`).toString("base64");
  const headers = { Authorization: `Basic ${credentials}`, Accept: "application/json" };
  const base = `https://${dbName}.appfolio.com/api/v2/reports`;

  const results: Record<string, any> = {};

  // Fetch property_directory — this is where we look for portfolio info
  try {
    const url = `${base}/property_directory.json?paginate_results=true`;
    const res = await fetch(url, { headers });
    if (!res.ok) {
      results.property_directory = { error: `HTTP ${res.status}`, body: (await res.text()).slice(0, 500) };
    } else {
      const data = await res.json();
      const rows = data.results || [];
      results.property_directory = {
        totalRows: rows.length,
        fields: rows.length > 0 ? Object.keys(rows[0]) : [],
        // Show first 3 rows so we can see actual field values
        sampleRows: rows.slice(0, 3),
        // Extract all unique portfolio-related values
        portfolioValues: [...new Set(rows.map((r: any) => {
          // Check every field that might contain portfolio info
          return JSON.stringify({
            portfolio: r.portfolio,
            Portfolio: r.Portfolio,
            portfolio_id: r.portfolio_id,
            portfolioId: r.portfolioId,
            property_group_name: r.property_group_name,
            PropertyGroupName: r.PropertyGroupName,
          });
        }))].map((s) => JSON.parse(s as string)),
      };
    }
  } catch (e: any) {
    results.property_directory = { error: e.message };
  }

  // Fetch rent_roll — first page only for field inspection
  try {
    const url = `${base}/rent_roll.json?paginate_results=true`;
    const res = await fetch(url, { headers });
    if (!res.ok) {
      results.rent_roll = { error: `HTTP ${res.status}`, body: (await res.text()).slice(0, 500) };
    } else {
      const data = await res.json();
      const rows = data.results || [];
      results.rent_roll = {
        totalRows: rows.length,
        hasNextPage: !!data.next_page_url,
        fields: rows.length > 0 ? Object.keys(rows[0]) : [],
        sampleRows: rows.slice(0, 3),
        // Show unique property values so we can match against property_directory
        uniquePropertyValues: [...new Set(rows.map((r: any) => String(r.property || r.Property || "N/A")))].slice(0, 20),
      };
    }
  } catch (e: any) {
    results.rent_roll = { error: e.message };
  }

  return NextResponse.json({
    apiVersion: "v2",
    baseUrl: base,
    database: dbName,
    ...results,
  });
}
