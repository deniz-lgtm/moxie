import { NextResponse } from "next/server";
import {
  queryDatabase,
  getDatabase,
  resolveDatabaseId,
  createDatabasePage,
  updatePage,
  notionPageToVendor,
  vendorToNotionProps,
} from "@/lib/notion";
import {
  listVendors,
  upsertVendorRows,
  getLastVendorSyncTime,
  upsertVendor,
} from "@/lib/vendors-db";
import type { DbVendor } from "@/lib/supabase";
import type { Vendor } from "@/lib/types";

function vendorToNotionPayload(v: Vendor) {
  return {
    name: v.name,
    category: v.category ?? null,
    scope: v.scope ?? null,
    phone: v.phone ?? null,
    email: v.email ?? null,
    website: v.website ?? null,
    address: v.address ?? null,
    contact_name: v.contactName ?? null,
    license_number: v.licenseNumber ?? null,
    insurance_expiry: v.insuranceExpiry ?? null,
    status: v.status ?? null,
    rating: v.rating ?? null,
    notes: v.notes ?? null,
    is_internal: v.isInternal,
  };
}

/**
 * POST /api/vendors/sync
 *
 * Bidirectional manual sync with the Notion Vendor DB (NOTION_VENDORS_DB_ID).
 *
 * Algorithm (per-row last-write-wins using Notion.last_edited_time vs
 * local.updated_at, both compared against notion_last_synced_at):
 *
 *  1. Fetch Notion DB schema + all pages.
 *  2. Pull: for each Notion page without a matching local row → create.
 *     For each Notion page with a local match where Notion.last_edited_time
 *     > local.notion_last_synced_at AND Notion edit is newer than local
 *     edit → overwrite local with Notion.
 *  3. Push: for each local row where local.updated_at > notion_last_synced_at
 *     → update the Notion page (or create one if no notion_page_id).
 */
export async function POST() {
  const rawId = process.env.NOTION_VENDORS_DB_ID;
  if (!rawId) {
    return NextResponse.json(
      { error: "NOTION_VENDORS_DB_ID not configured" },
      { status: 400 }
    );
  }

  try {
    // NOTION_VENDORS_DB_ID may be either a database id or the id of the page
    // that contains the database. Resolve once per request.
    const dbId = await resolveDatabaseId(rawId);
    const [schema, notionPages, localVendors] = await Promise.all([
      getDatabase(dbId),
      queryDatabase(dbId),
      listVendors(),
    ]);

    const byNotionId = new Map<string, Vendor>();
    const locals = [...localVendors];
    for (const v of locals) {
      if (v.notionPageId) byNotionId.set(v.notionPageId, v);
    }

    const nowIso = new Date().toISOString();
    const pullRows: Array<Omit<DbVendor, "created_at" | "updated_at">> = [];
    let pulled = 0;
    let pushed = 0;
    let created = 0;
    const errors: string[] = [];

    // ── PULL phase ─────────────────────────────────────────────────
    for (const page of notionPages) {
      const fields = notionPageToVendor(page);
      if (!fields) continue;

      const existing = byNotionId.get(fields.notion_page_id);
      const notionEditedMs = Date.parse(fields.notion_last_edited);

      if (!existing) {
        pullRows.push({
          id: `v-${fields.notion_page_id.replace(/-/g, "")}`,
          name: fields.name,
          category: fields.category,
          scope: fields.scope,
          phone: fields.phone,
          email: fields.email,
          website: fields.website,
          address: fields.address,
          contact_name: fields.contact_name,
          license_number: fields.license_number,
          insurance_expiry: fields.insurance_expiry,
          status: fields.status,
          rating: fields.rating,
          notes: fields.notes,
          is_internal: fields.is_internal,
          notion_page_id: fields.notion_page_id,
          notion_last_synced_at: nowIso,
          raw: fields.raw,
        });
        pulled++;
        continue;
      }

      const localUpdatedMs = Date.parse(existing.updatedAt);
      const lastSyncedMs = existing.notionLastSyncedAt
        ? Date.parse(existing.notionLastSyncedAt)
        : 0;
      const notionChanged = notionEditedMs > lastSyncedMs;
      const localChanged = localUpdatedMs > lastSyncedMs;

      // Last-write-wins. If Notion is newer (or tie), pull.
      if (notionChanged && notionEditedMs >= localUpdatedMs) {
        pullRows.push({
          id: existing.id,
          name: fields.name,
          category: fields.category,
          scope: fields.scope,
          phone: fields.phone,
          email: fields.email,
          website: fields.website,
          address: fields.address,
          contact_name: fields.contact_name,
          license_number: fields.license_number,
          insurance_expiry: fields.insurance_expiry,
          status: fields.status,
          rating: fields.rating,
          notes: fields.notes,
          is_internal: fields.is_internal,
          notion_page_id: fields.notion_page_id,
          notion_last_synced_at: nowIso,
          raw: fields.raw,
        });
        pulled++;
        byNotionId.set(fields.notion_page_id, {
          ...existing,
          name: fields.name,
          category: fields.category ?? undefined,
          scope: fields.scope ?? undefined,
          phone: fields.phone ?? undefined,
          email: fields.email ?? undefined,
          website: fields.website ?? undefined,
          address: fields.address ?? undefined,
          contactName: fields.contact_name ?? undefined,
          licenseNumber: fields.license_number ?? undefined,
          insuranceExpiry: fields.insurance_expiry ?? undefined,
          status: (fields.status ?? undefined) as Vendor["status"],
          rating: fields.rating ?? undefined,
          notes: fields.notes ?? undefined,
          isInternal: fields.is_internal,
          notionLastSyncedAt: nowIso,
        });
        // Not local-changed or Notion tied → done. Otherwise fall through to push below.
      } else if (!localChanged) {
        // Nothing to do.
      }
    }

    if (pullRows.length > 0) {
      await upsertVendorRows(pullRows);
    }

    // ── PUSH phase ─────────────────────────────────────────────────
    // Re-read to pick up the freshly pulled rows so we don't redundantly
    // push what we just synced.
    const afterPull = await listVendors();
    for (const v of afterPull) {
      const localUpdatedMs = Date.parse(v.updatedAt);
      const lastSyncedMs = v.notionLastSyncedAt ? Date.parse(v.notionLastSyncedAt) : 0;
      const localChanged = localUpdatedMs > lastSyncedMs;

      try {
        if (!v.notionPageId) {
          // Create in Notion
          const page = await createDatabasePage(
            dbId,
            vendorToNotionProps(vendorToNotionPayload(v), schema)
          );
          await upsertVendor({
            ...v,
            notionPageId: page.id,
            notionLastSyncedAt: nowIso,
          });
          created++;
        } else if (localChanged) {
          // Push local update to Notion
          await updatePage(
            v.notionPageId,
            vendorToNotionProps(vendorToNotionPayload(v), schema)
          );
          await upsertVendor({ ...v, notionLastSyncedAt: nowIso });
          pushed++;
        }
      } catch (e: any) {
        errors.push(`${v.name}: ${e.message ?? e}`);
      }
    }

    const syncedAt = await getLastVendorSyncTime();
    return NextResponse.json({
      ok: true,
      pulled,
      pushed,
      createdInNotion: created,
      errors,
      syncedAt,
    });
  } catch (error: any) {
    return NextResponse.json(
      { error: error.message || "Sync failed" },
      { status: 500 }
    );
  }
}

export async function GET() {
  try {
    const syncedAt = await getLastVendorSyncTime();
    return NextResponse.json({
      syncedAt,
      configured: !!process.env.NOTION_VENDORS_DB_ID,
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
