import { NextResponse } from "next/server";
import fs from "fs";
import path from "path";
import { getSupabase } from "@/lib/supabase";
import { RUBS_BILLS_BUCKET } from "@/lib/rubs-storage";

const DOWNLOADER_URL = process.env.RUBS_DOWNLOADER_URL || "";
const DOWNLOADER_TOKEN = process.env.RUBS_DOWNLOADER_TOKEN || "";
const LOCAL_BILLS_FOLDER = process.env.RUBS_BILLS_FOLDER || "";

export const dynamic = "force-dynamic";

// GET /api/rubs/pdf?file=<path> — stream a PDF from the bills source.
// Prefers Supabase Storage; falls back to the legacy ngrok/local setup.
export async function GET(request: Request) {
  const url = new URL(request.url);
  const filename = url.searchParams.get("file");
  if (!filename) {
    return NextResponse.json({ error: "Missing ?file parameter" }, { status: 400 });
  }

  const relPath = filename
    .split(/[/\\]/)
    .filter((seg) => seg && seg !== "." && seg !== "..")
    .join("/");
  if (!relPath || !relPath.toLowerCase().endsWith(".pdf")) {
    return NextResponse.json({ error: "Invalid filename" }, { status: 400 });
  }

  const displayName = relPath.split("/").pop() || "bill.pdf";

  // 1. Preferred: Supabase Storage
  const sb = getSupabase();
  if (sb) {
    try {
      const { data, error } = await sb.storage.from(RUBS_BILLS_BUCKET).download(relPath);
      if (!error && data) {
        const buf = await data.arrayBuffer();
        return new NextResponse(buf, {
          headers: {
            "Content-Type": "application/pdf",
            "Content-Disposition": `inline; filename="${displayName}"`,
            "Cache-Control": "private, max-age=3600",
          },
        });
      }
      // Fall through to legacy sources if the file isn't in Supabase
      // (e.g. older imports from the ngrok era).
    } catch {
      // Fall through
    }
  }

  // 2. Legacy: remote ngrok downloader
  if (DOWNLOADER_URL && DOWNLOADER_TOKEN) {
    try {
      const encodedPath = relPath.split("/").map(encodeURIComponent).join("/");
      const res = await fetch(`${DOWNLOADER_URL.replace(/\/$/, "")}/files/${encodedPath}`, {
        headers: {
          Authorization: `Bearer ${DOWNLOADER_TOKEN}`,
          "ngrok-skip-browser-warning": "1",
        },
      });
      if (res.ok) {
        const buf = await res.arrayBuffer();
        return new NextResponse(buf, {
          headers: {
            "Content-Type": "application/pdf",
            "Content-Disposition": `inline; filename="${displayName}"`,
            "Cache-Control": "private, max-age=3600",
          },
        });
      }
    } catch {
      // Fall through
    }
  }

  // 3. Legacy: local filesystem
  if (LOCAL_BILLS_FOLDER) {
    const filePath = path.join(LOCAL_BILLS_FOLDER, ...relPath.split("/"));
    if (fs.existsSync(filePath)) {
      const buf = fs.readFileSync(filePath);
      return new NextResponse(buf, {
        headers: {
          "Content-Type": "application/pdf",
          "Content-Disposition": `inline; filename="${displayName}"`,
        },
      });
    }
  }

  return NextResponse.json({ error: "PDF not found" }, { status: 404 });
}
