import { NextResponse } from "next/server";
import fs from "fs";
import path from "path";

const DOWNLOADER_URL = process.env.RUBS_DOWNLOADER_URL || "";
const DOWNLOADER_TOKEN = process.env.RUBS_DOWNLOADER_TOKEN || "";
const LOCAL_BILLS_FOLDER = process.env.RUBS_BILLS_FOLDER || "";

export const dynamic = "force-dynamic";

// GET /api/rubs/pdf?file=<path> — stream a PDF from the bills folder
// Exists because the browser can't talk to the tunnel directly with the
// shared bearer token, so we proxy through the webapp.
export async function GET(request: Request) {
  const url = new URL(request.url);
  const filename = url.searchParams.get("file");
  if (!filename) {
    return NextResponse.json({ error: "Missing ?file parameter" }, { status: 400 });
  }

  // Sanitize path segments
  const relPath = filename
    .split(/[/\\]/)
    .filter((seg) => seg && seg !== "." && seg !== "..")
    .join("/");
  if (!relPath || !relPath.toLowerCase().endsWith(".pdf")) {
    return NextResponse.json({ error: "Invalid filename" }, { status: 400 });
  }

  const displayName = relPath.split("/").pop() || "bill.pdf";

  // Prefer remote downloader
  if (DOWNLOADER_URL && DOWNLOADER_TOKEN) {
    try {
      const encodedPath = relPath.split("/").map(encodeURIComponent).join("/");
      const res = await fetch(`${DOWNLOADER_URL.replace(/\/$/, "")}/files/${encodedPath}`, {
        headers: {
          Authorization: `Bearer ${DOWNLOADER_TOKEN}`,
          "ngrok-skip-browser-warning": "1",
        },
      });
      if (!res.ok) {
        const errText = await res.text().catch(() => "");
        return NextResponse.json(
          { error: `Downloader returned ${res.status}: ${errText.slice(0, 200)}` },
          { status: res.status }
        );
      }
      const buf = await res.arrayBuffer();
      return new NextResponse(buf, {
        headers: {
          "Content-Type": "application/pdf",
          "Content-Disposition": `inline; filename="${displayName}"`,
          "Cache-Control": "private, max-age=3600",
        },
      });
    } catch (err: any) {
      return NextResponse.json(
        { error: `Could not reach downloader: ${err.message}` },
        { status: 502 }
      );
    }
  }

  // Local filesystem fallback (for dev)
  if (LOCAL_BILLS_FOLDER) {
    const filePath = path.join(LOCAL_BILLS_FOLDER, ...relPath.split("/"));
    if (!fs.existsSync(filePath)) {
      return NextResponse.json({ error: "File not found" }, { status: 404 });
    }
    const buf = fs.readFileSync(filePath);
    return new NextResponse(buf, {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `inline; filename="${displayName}"`,
      },
    });
  }

  return NextResponse.json(
    { error: "No bill source configured (RUBS_DOWNLOADER_URL or RUBS_BILLS_FOLDER)" },
    { status: 500 }
  );
}
