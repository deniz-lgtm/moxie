import { NextResponse } from "next/server";

const DOWNLOADER_URL = process.env.RUBS_DOWNLOADER_URL || "";
const DOWNLOADER_TOKEN = process.env.RUBS_DOWNLOADER_TOKEN || "";

export const dynamic = "force-dynamic";

function notConfigured() {
  return NextResponse.json(
    {
      error:
        "Bill downloader service not configured. Set RUBS_DOWNLOADER_URL and RUBS_DOWNLOADER_TOKEN in Railway to point at the local bill-downloader service tunnel.",
      configured: false,
    },
    { status: 500 }
  );
}

// GET — Check download status from the remote service
export async function GET() {
  if (!DOWNLOADER_URL || !DOWNLOADER_TOKEN) return notConfigured();

  try {
    const res = await fetch(`${DOWNLOADER_URL.replace(/\/$/, "")}/status`, {
      headers: { Authorization: `Bearer ${DOWNLOADER_TOKEN}` },
      cache: "no-store",
    });
    const data = await res.json().catch(() => ({}));
    return NextResponse.json({ configured: true, ...data }, { status: res.status });
  } catch (error: any) {
    return NextResponse.json(
      { error: `Could not reach downloader service: ${error.message}`, configured: true, reachable: false },
      { status: 502 }
    );
  }
}

// POST — Trigger a bill download job on the remote service
export async function POST(request: Request) {
  if (!DOWNLOADER_URL || !DOWNLOADER_TOKEN) return notConfigured();

  try {
    const body = await request.json().catch(() => ({}));
    const provider = (body as any).provider || "all";

    const res = await fetch(`${DOWNLOADER_URL.replace(/\/$/, "")}/download-bills`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${DOWNLOADER_TOKEN}`,
      },
      body: JSON.stringify({ provider }),
    });

    const data = await res.json().catch(() => ({}));
    return NextResponse.json(data, { status: res.status });
  } catch (error: any) {
    return NextResponse.json(
      { error: `Could not reach downloader service: ${error.message}` },
      { status: 502 }
    );
  }
}
