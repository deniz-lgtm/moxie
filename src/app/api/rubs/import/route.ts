import { NextResponse } from "next/server";
import fs from "fs";
import path from "path";
import { parseBillPdf } from "@/lib/rubs-bill-parser";

const DOWNLOADER_URL = process.env.RUBS_DOWNLOADER_URL || "";
const DOWNLOADER_TOKEN = process.env.RUBS_DOWNLOADER_TOKEN || "";
const LOCAL_BILLS_FOLDER = process.env.RUBS_BILLS_FOLDER || "";

export const dynamic = "force-dynamic";

// GET — List PDFs (from remote downloader tunnel, or local folder fallback)
export async function GET() {
  // Prefer the remote downloader service if configured
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
            error: `Downloader service returned non-JSON (status ${res.status}). The tunnel URL may be invalid, offline, or pointing to the wrong server. First 200 chars: ${text.slice(0, 200)}`,
          },
          { status: 502 }
        );
      }
      if (!res.ok) {
        return NextResponse.json(
          { error: data.error || `Downloader service returned ${res.status}` },
          { status: res.status }
        );
      }
      return NextResponse.json(data);
    } catch (error: any) {
      return NextResponse.json(
        { error: `Could not reach downloader service at ${DOWNLOADER_URL}: ${error.message}` },
        { status: 502 }
      );
    }
  }

  // Local filesystem fallback (for dev on the same machine as the bills folder)
  if (!LOCAL_BILLS_FOLDER) {
    return NextResponse.json(
      {
        error:
          "Bills source not configured. Set RUBS_DOWNLOADER_URL + RUBS_DOWNLOADER_TOKEN (for Railway) or RUBS_BILLS_FOLDER (for local dev).",
      },
      { status: 500 }
    );
  }

  try {
    if (!fs.existsSync(LOCAL_BILLS_FOLDER)) {
      return NextResponse.json({ error: `Folder not found: ${LOCAL_BILLS_FOLDER}` }, { status: 404 });
    }
    const entries = fs.readdirSync(LOCAL_BILLS_FOLDER);
    const files = entries
      .filter((f) => f.toLowerCase().endsWith(".pdf"))
      .map((name) => {
        const stat = fs.statSync(path.join(LOCAL_BILLS_FOLDER, name));
        return { name, size: stat.size, modified: stat.mtime.toISOString() };
      })
      .sort((a, b) => b.modified.localeCompare(a.modified));
    return NextResponse.json({ folder: LOCAL_BILLS_FOLDER, files });
  } catch (error: any) {
    return NextResponse.json({ error: error.message || "Failed to scan folder" }, { status: 500 });
  }
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

    // The file-server returns names like "subfolder/bill.pdf". Preserve the
    // relative path but sanitize each segment to block traversal attempts.
    const relPath = filename
      .split(/[/\\]/)
      .filter((seg) => seg && seg !== "." && seg !== "..")
      .join("/");
    if (!relPath) {
      return NextResponse.json({ error: "Invalid filename" }, { status: 400 });
    }
    // URL-encode each segment individually so slashes stay as path separators
    const encodedPath = relPath.split("/").map(encodeURIComponent).join("/");
    const displayName = relPath.split("/").pop() || relPath;
    let pdfBase64: string;

    // Fetch the PDF bytes: either from the remote downloader or from local disk
    if (DOWNLOADER_URL && DOWNLOADER_TOKEN) {
      const res = await fetch(
        `${DOWNLOADER_URL.replace(/\/$/, "")}/files/${encodedPath}`,
        {
          headers: {
            Authorization: `Bearer ${DOWNLOADER_TOKEN}`,
            "ngrok-skip-browser-warning": "1",
          },
        }
      );
      if (!res.ok) {
        const errText = await res.text().catch(() => "");
        return NextResponse.json(
          { error: `Could not fetch PDF from downloader: ${res.status} ${errText}` },
          { status: 502 }
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
        { status: 500 }
      );
    }

    const results = await parseBillPdf(pdfBase64, knownProperties || [], displayName, aliases || []);
    return NextResponse.json({ results });
  } catch (error: any) {
    return NextResponse.json(
      { error: error.message || "Failed to parse bill" },
      { status: 500 }
    );
  }
}
