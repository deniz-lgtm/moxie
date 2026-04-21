// ============================================
// RUBS Bill PDFs — Supabase Storage client
// ============================================
// Replaces the old ngrok-tunnelled downloader service. Browsers upload
// PDFs straight into the `rubs-bills` bucket; the server reads them back
// from Supabase instead of a Windows box.

import { getSupabase } from "./supabase";

export const RUBS_BILLS_BUCKET = "rubs-bills";

export interface StoredBillFile {
  name: string; // path inside the bucket, e.g. "2026-04/ladwp-acct1.pdf"
  size: number;
  modified: string; // ISO timestamp
}

/** Upload a single PDF from the browser. Returns the stored path. */
export async function uploadBillPdf(file: File, folder = ""): Promise<string> {
  const sb = getSupabase();
  if (!sb) throw new Error("Supabase not configured");

  const safeName = file.name.replace(/[\\/]/g, "_");
  const prefix = folder ? `${folder.replace(/\/+$/, "")}/` : "";
  const path = `${prefix}${Date.now()}-${safeName}`;

  const { error } = await sb.storage.from(RUBS_BILLS_BUCKET).upload(path, file, {
    contentType: file.type || "application/pdf",
    upsert: false,
  });
  if (error) throw new Error(`Upload failed for ${file.name}: ${error.message}`);
  return path;
}

/** List all PDFs in the bucket (recursive). */
export async function listBillPdfs(): Promise<StoredBillFile[]> {
  const sb = getSupabase();
  if (!sb) return [];

  const out: StoredBillFile[] = [];
  await walk(sb, "", out);
  // Newest first
  out.sort((a, b) => b.modified.localeCompare(a.modified));
  return out;
}

async function walk(
  sb: ReturnType<typeof getSupabase>,
  prefix: string,
  out: StoredBillFile[],
): Promise<void> {
  if (!sb) return;
  const { data, error } = await sb.storage.from(RUBS_BILLS_BUCKET).list(prefix, {
    limit: 1000,
    sortBy: { column: "updated_at", order: "desc" },
  });
  if (error || !data) return;
  for (const entry of data) {
    const fullPath = prefix ? `${prefix}/${entry.name}` : entry.name;
    if (entry.id === null) {
      // Folder
      await walk(sb, fullPath, out);
    } else if (entry.name.toLowerCase().endsWith(".pdf")) {
      out.push({
        name: fullPath,
        size: entry.metadata?.size ?? 0,
        modified: entry.updated_at ?? entry.created_at ?? new Date().toISOString(),
      });
    }
  }
}

/** Public URL for viewing a PDF in the browser. */
export function getBillPdfUrl(path: string): string | null {
  const sb = getSupabase();
  if (!sb) return null;
  const { data } = sb.storage.from(RUBS_BILLS_BUCKET).getPublicUrl(path);
  return data.publicUrl;
}

/** Delete a PDF (used when removing an imported bill). */
export async function deleteBillPdf(path: string): Promise<void> {
  const sb = getSupabase();
  if (!sb) return;
  await sb.storage.from(RUBS_BILLS_BUCKET).remove([path]);
}

/** Wipe every PDF in the bucket. Used by "Clear All Bills". */
export async function deleteAllBillPdfs(): Promise<number> {
  const sb = getSupabase();
  if (!sb) return 0;
  const files = await listBillPdfs();
  if (files.length === 0) return 0;
  const paths = files.map((f) => f.name);
  // Supabase remove() handles up to 1000 paths in one call.
  for (let i = 0; i < paths.length; i += 1000) {
    const batch = paths.slice(i, i + 1000);
    await sb.storage.from(RUBS_BILLS_BUCKET).remove(batch);
  }
  return paths.length;
}
