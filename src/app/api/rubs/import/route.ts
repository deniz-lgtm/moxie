import { NextResponse } from "next/server";
import fs from "fs";
import path from "path";
import { parseBillPdf } from "@/lib/rubs-bill-parser";

const BILLS_FOLDER = process.env.RUBS_BILLS_FOLDER || "";

export const dynamic = "force-dynamic";

// GET — Scan folder for PDF files
export async function GET() {
  if (!BILLS_FOLDER) {
    return NextResponse.json(
      { error: "RUBS_BILLS_FOLDER environment variable not configured" },
      { status: 500 }
    );
  }

  try {
    if (!fs.existsSync(BILLS_FOLDER)) {
      return NextResponse.json(
        { error: `Folder not found: ${BILLS_FOLDER}` },
        { status: 404 }
      );
    }

    const entries = fs.readdirSync(BILLS_FOLDER);
    const files = entries
      .filter((f) => f.toLowerCase().endsWith(".pdf"))
      .map((name) => {
        const stat = fs.statSync(path.join(BILLS_FOLDER, name));
        return {
          name,
          size: stat.size,
          modified: stat.mtime.toISOString(),
        };
      })
      .sort((a, b) => b.modified.localeCompare(a.modified)); // newest first

    return NextResponse.json({ folder: BILLS_FOLDER, files });
  } catch (error: any) {
    return NextResponse.json(
      { error: error.message || "Failed to scan folder" },
      { status: 500 }
    );
  }
}

// POST — Parse a specific PDF with AI
export async function POST(request: Request) {
  if (!BILLS_FOLDER) {
    return NextResponse.json(
      { error: "RUBS_BILLS_FOLDER environment variable not configured" },
      { status: 500 }
    );
  }

  try {
    const body = await request.json();
    const { filename, knownProperties } = body as {
      filename: string;
      knownProperties: string[];
    };

    if (!filename) {
      return NextResponse.json({ error: "Missing filename" }, { status: 400 });
    }

    // Prevent path traversal
    const safeName = path.basename(filename);
    const filePath = path.join(BILLS_FOLDER, safeName);

    if (!fs.existsSync(filePath)) {
      return NextResponse.json({ error: "File not found" }, { status: 404 });
    }

    // Read PDF and convert to base64
    const pdfBuffer = fs.readFileSync(filePath);
    const pdfBase64 = pdfBuffer.toString("base64");

    // Parse with AI
    const results = await parseBillPdf(pdfBase64, knownProperties || [], safeName);

    return NextResponse.json({ results });
  } catch (error: any) {
    return NextResponse.json(
      { error: error.message || "Failed to parse bill" },
      { status: 500 }
    );
  }
}
