import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function GET() {
  const clientId = process.env.APPFOLIO_CLIENT_ID;
  const clientSecret = process.env.APPFOLIO_CLIENT_SECRET;
  const dbName = process.env.APPFOLIO_DATABASE_NAME;

  const configured = !!(clientId && clientSecret && dbName);

  if (!configured) {
    return NextResponse.json({
      status: "not_configured",
      detail: {
        APPFOLIO_CLIENT_ID: clientId ? "set" : "missing",
        APPFOLIO_CLIENT_SECRET: clientSecret ? "set" : "missing",
        APPFOLIO_DATABASE_NAME: dbName ? "set" : "missing",
      },
    });
  }

  try {
    const credentials = Buffer.from(`${clientId}:${clientSecret}`).toString("base64");
    const url = `https://${dbName}.appfolio.com/api/v2/reports/property_directory.json?paginate_results=true`;
    const res = await fetch(url, {
      headers: {
        Authorization: `Basic ${credentials}`,
        Accept: "application/json",
      },
    });

    if (!res.ok) {
      const text = await res.text();
      return NextResponse.json({
        status: "error",
        httpStatus: res.status,
        url_attempted: `https://${dbName}.appfolio.com/api/v2/reports/property_directory.json`,
        detail: text.slice(0, 500),
      });
    }

    const data = await res.json();
    const results = data.results || data || [];
    const count = Array.isArray(results) ? results.length : "unknown";

    return NextResponse.json({
      status: "connected",
      database: dbName,
      apiVersion: "v2",
      endpoint: "reports/property_directory",
      propertiesFound: count,
      sampleFields: Array.isArray(results) && results.length > 0
        ? Object.keys(results[0])
        : [],
    });
  } catch (error: any) {
    return NextResponse.json({
      status: "error",
      detail: error.message,
    });
  }
}
