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

  // Try a real API call to verify credentials work
  try {
    const credentials = Buffer.from(`${clientId}:${clientSecret}`).toString("base64");
    const url = `https://${dbName}.appfolio.com/api/v2/properties.json`;
    const res = await fetch(url, {
      headers: {
        Authorization: `Basic ${credentials}`,
        "Content-Type": "application/json",
      },
    });

    if (!res.ok) {
      const text = await res.text();
      return NextResponse.json({
        status: "error",
        httpStatus: res.status,
        detail: text.slice(0, 500),
        url: url.replace(clientId!, "***").replace(clientSecret!, "***"),
      });
    }

    const data = await res.json();
    const count = Array.isArray(data) ? data.length : (data.properties?.length ?? "unknown");

    return NextResponse.json({
      status: "connected",
      database: dbName,
      propertiesFound: count,
    });
  } catch (error: any) {
    return NextResponse.json({
      status: "error",
      detail: error.message,
    });
  }
}
