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

/** Fetch JSON from the tunnel, returning { ok, data, error } where error is a human-readable message. */
async function tunnelFetch(path: string, init?: RequestInit): Promise<{ ok: boolean; status: number; data: any; error?: string }> {
  try {
    const res = await fetch(`${DOWNLOADER_URL.replace(/\/$/, "")}${path}`, {
      ...init,
      headers: {
        ...(init?.headers || {}),
        Authorization: `Bearer ${DOWNLOADER_TOKEN}`,
        // Bypass ngrok free-tier browser warning interstitial
        "ngrok-skip-browser-warning": "1",
      },
      cache: "no-store",
    });

    const text = await res.text();
    let data: any = {};
    try {
      data = text ? JSON.parse(text) : {};
    } catch {
      // Upstream returned non-JSON (likely an HTML error page, ngrok offline page, etc.)
      return {
        ok: false,
        status: res.status,
        data: {},
        error: `Downloader service returned non-JSON (status ${res.status}). The tunnel URL may be invalid, offline, or pointing to the wrong server. First 200 chars: ${text.slice(0, 200)}`,
      };
    }

    if (!res.ok) {
      return {
        ok: false,
        status: res.status,
        data,
        error: data.error || `Downloader service returned ${res.status}`,
      };
    }

    return { ok: true, status: res.status, data };
  } catch (error: any) {
    return {
      ok: false,
      status: 502,
      data: {},
      error: `Could not reach downloader service at ${DOWNLOADER_URL}: ${error.message}`,
    };
  }
}

// GET — Check download status from the remote service
export async function GET() {
  if (!DOWNLOADER_URL || !DOWNLOADER_TOKEN) return notConfigured();

  const result = await tunnelFetch("/status");
  if (!result.ok) {
    return NextResponse.json(
      { configured: true, reachable: false, error: result.error },
      { status: result.status || 502 }
    );
  }
  return NextResponse.json({ configured: true, reachable: true, ...result.data });
}

// POST — Trigger a bill download job on the remote service
export async function POST(request: Request) {
  if (!DOWNLOADER_URL || !DOWNLOADER_TOKEN) return notConfigured();

  const body = await request.json().catch(() => ({}));
  const provider = (body as any).provider || "all";

  const result = await tunnelFetch("/download-bills", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ provider }),
  });

  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: result.status || 502 });
  }
  return NextResponse.json(result.data);
}
