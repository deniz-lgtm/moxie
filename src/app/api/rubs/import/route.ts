import { NextResponse } from "next/server";
import fs from "fs";
import path from "path";
import { parseBillPdf } from "@/lib/rubs-bill-parser";
import { getSupabase } from "@/lib/supabase";
import { RUBS_BILLS_BUCKET } from "@/lib/rubs-storage";

const DOWNLOADER_URL = process.env.RUBS_DOWNLOADER_URL || "";
const DOWNLOADER_TOKEN = process.env.RUBS_DOWNLOADER_TOKEN || "";
const LOCAL_BILLS_FOLDER = process.env.RUBS_BILLS_FOLDER || "";

export const dynamic = "force-dynamic";

// GET — List PDFs (prefers Supabase Storage; falls back to ngrok tunnel or local folder)
export async function GET() {
  // 1. Preferred: Supabase Storage
  const sb = getSupabase();
  if (sb) {
    try {
      const files: { name: string; size: number; modified: string }[] = [];
      await walkBucket(sb, "", files);
      files.sort((a, b) => b.modified.localeCompare(a.modified));
      return NextResponse.json({ folder: `supabase:${RUBS_BILLS_BUCKET}`, files });
    } catch (error: any) {
      return NextResponse.json(
        { error: `Could not list Supabase Storage bucket: ${error.message || error}` },
        { status: 502 },
      );
    }
  }

  // 2. Legacy: remote ngrok downloader
  if (DOWNLOADER_URL && DOWNLOADER_TOKEN) {
    try {
      const res = await fetch(`${DOWNLOADER_URL.replace(/\/$/, "")}/files`, {
        headers: {
          Authorization: `Bearer ${DOWNLOADER_TOKEN}`,
          "ngrok-skip-browser-warning": "1",
        },
        cache: "no-store",
      });
      const text = await res.text();
      let data: any = {};
      try {
        data = text ? JSON.parse(text) : {};
      } catch {
        return NextResponse.json(
          {
            error: `Downloader service returned non-JSON (status ${res.status}). First 200 chars: ${text.slice(0, 200)}`,
          },
          { status: 502 },
        );
      }
      if (!res.ok) {
        return NextResponse.json(
          { error: data.error || `Downloader service returned ${res.status}` },
          { status: res.status },
        );
      }
      return NextResponse.json(data);
    } catch (error: any) {
      return NextResponse.json(
        { error: `Could not reach downloader service at ${DOWNLOADER_URL}: ${error.message}` },
        { status: 502 },
      );
    }
  }

  // 3. Legacy: local filesystem
  if (LOCAL_BILLS_FOLDER) {
    try {
      if (!fs.existsSync(LOCAL_BILLS_FOLDER)) {
        return NextResponse.json({ error: `Folder not found: ${LOCAL_BILLS_FOLDER}` }, { status: 404 });
      }
      const entries = fs.readdirSync(LOCAL_BILLS_FOLDER);
      const files = entries
        .filter((f: string) => f.toLowerCase().endsWith(".pdf"))
        .map((name: string) => {
          const stat = fs.statSync(path.join(LOCAL_BILLS_FOLDER, name));
          return { name, size: stat.size, modified: stat.mtime.toISOString() };
        })
        .sort((a: any, b: any) => b.modified.localeCompare(a.modified));
      return NextResponse.json({ folder: LOCAL_BILLS_FOLDER, files });
    } catch (error: any) {
      return NextResponse.json({ error: error.message || "Failed to scan folder" }, { status: 500 });
    }
  }

  return NextResponse.json(
    { error: "Supabase is not configured and no fallback bills folder was set." },
    { status: 500 },
  );
}

// POST — Parse a specific PDF with AI
export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { filename, knownProperties, aliases } = body as {
      filename: string;
      knownProperties: string[];
      aliases?: import("@/lib/rubs-types").PropertyAlias[];
    };

    if (!filename) {
      return NextResponse.json({ error: "Missing filename" }, { status: 400 });
    }

    const relPath = filename
      .split(/[/\\]/)
      .filter((seg) => seg && seg !== "." && seg !== "..")
      .join("/");
    if (!relPath) {
      return NextResponse.json({ error: "Invalid filename" }, { status: 400 });
    }
    const displayName = relPath.split("/").pop() || relPath;
    let pdfBase64: string;

    const sb = getSupabase();
    if (sb) {
      // Preferred: fetch from Supabase Storage
      const { data, error } = await sb.storage.from(RUBS_BILLS_BUCKET).download(relPath);
      if (error || !data) {
        return NextResponse.json(
          { error: `Could not fetch PDF from Supabase: ${error?.message || "not found"}` },
          { status: 502 },
        );
      }
      const arrayBuf = await data.arrayBuffer();
      pdfBase64 = Buffer.from(arrayBuf).toString("base64");
    } else if (DOWNLOADER_URL && DOWNLOADER_TOKEN) {
      const encodedPath = relPath.split("/").map(encodeURIComponent).join("/");
      const res = await fetch(
        `${DOWNLOADER_URL.replace(/\/$/, "")}/files/${encodedPath}`,
        {
          headers: {
            Authorization: `Bearer ${DOWNLOADER_TOKEN}`,
            "ngrok-skip-browser-warning": "1",
          },
        },
      );
      if (!res.ok) {
        const errText = await res.text().catch(() => "");
        return NextResponse.json(
          { error: `Could not fetch PDF from downloader: ${res.status} ${errText}` },
          { status: 502 },
        );
      }
      const arrayBuf = await res.arrayBuffer();
      pdfBase64 = Buffer.from(arrayBuf).toString("base64");
    } else if (LOCAL_BILLS_FOLDER) {
      const filePath = path.join(LOCAL_BILLS_FOLDER, ...relPath.split("/"));
      if (!fs.existsSync(filePath)) {
        return NextResponse.json({ error: "File not found" }, { status: 404 });
      }
      pdfBase64 = fs.readFileSync(filePath).toString("base64");
    } else {
      return NextResponse.json(
        { error: "Bills source not configured" },
        { status: 500 },
      );
    }

    const results = await parseBillPdf(pdfBase64, knownProperties || [], displayName, aliases || []);
    return NextResponse.json({ results });
  } catch (error: any) {
    return NextResponse.json(
      { error: error.message || "Failed to parse bill" },
      { status: 500 },
    );
  }
}

// ─── Helpers ───────────────────────────────────────────────────

async function walkBucket(
  sb: NonNullable<ReturnType<typeof getSupabase>>,
  prefix: string,
  out: { name: string; size: number; modified: string }[],
): Promise<void> {
  const { data, error } = await sb.storage.from(RUBS_BILLS_BUCKET).list(prefix, {
    limit: 1000,
    sortBy: { column: "updated_at", order: "desc" },
  });
  if (error || !data) return;
  for (const entry of data) {
    const fullPath = prefix ? `${prefix}/${entry.name}` : entry.name;
    if (entry.id === null) {
      await walkBucket(sb, fullPath, out);
    } else if (entry.name.toLowerCase().endsWith(".pdf")) {
      out.push({
        name: fullPath,
        size: (entry.metadata?.size as number | undefined) ?? 0,
        modified: entry.updated_at ?? entry.created_at ?? new Date().toISOString(),
      });
    }
  }
}
