import { NextResponse } from "next/server";
import { getRentalApplications, getRentRoll } from "@/lib/appfolio";
import { getSupabase } from "@/lib/supabase";

export const dynamic = "force-dynamic";

const MOXIE_PORTFOLIO_ID = "24";

// Candidate field names AppFolio might use for the referral/lead source
const LEAD_SOURCE_FIELDS = [
  "lead_source",
  "referral_source",
  "prospect_source",
  "marketing_source",
  "how_did_you_hear",
  "source",
  "LeadSource",
  "ReferralSource",
];

function pickField(row: Record<string, unknown>, candidates: string[]): string | null {
  for (const k of candidates) {
    const v = row[k];
    if (v != null && String(v).trim() !== "") return String(v).trim();
  }
  return null;
}

type SourceRow = {
  source: string;
  guestCardInquiries: number;
  showings: number;
  applications: number;
  approved: number;
  converted: number;
};

type ProspectSourcesResponse = {
  rows: SourceRow[];
  properties: string[];
  sourceFieldFound: string | null;
  lastUpdated: string;
};

export async function GET(request: Request): Promise<NextResponse> {
  const { searchParams } = new URL(request.url);
  const propertyFilter = searchParams.get("property") ?? "all";

  try {
    // --- AppFolio: applications ---
    const [rawApps, rawRentRoll] = await Promise.all([
      getRentalApplications().catch(() => [] as any[]),
      getRentRoll().catch(() => [] as any[]),
    ]);

    // Filter to Moxie portfolio
    const apps = (rawApps || []).filter((r: any) => {
      const pid = String(r.portfolio_id ?? "").trim();
      return pid === MOXIE_PORTFOLIO_ID;
    });

    const rentRoll = (rawRentRoll || []).filter((r: any) => {
      const pid = String(r.portfolio_id ?? "").trim();
      return pid === MOXIE_PORTFOLIO_ID;
    });

    // Detect which lead_source field name AppFolio actually uses
    let sourceFieldFound: string | null = null;
    if (apps.length > 0) {
      for (const candidate of LEAD_SOURCE_FIELDS) {
        if (apps.some((r: any) => r[candidate] != null && String(r[candidate]).trim() !== "")) {
          sourceFieldFound = candidate;
          break;
        }
      }
    }

    // Build a set of property names from rent_roll (converted tenants)
    // Key: lower-cased applicant email or name → property
    const convertedEmails = new Set<string>();
    const convertedNames = new Set<string>();
    for (const r of rentRoll) {
      const email = String(r.email || r.Email || "").toLowerCase().trim();
      const name = String(r.tenant_name || r.TenantName || r.Name || "").toLowerCase().trim();
      const prop = String(r.property_name || r.PropertyName || "");
      if (propertyFilter !== "all" && prop !== propertyFilter) continue;
      if (email) convertedEmails.add(email);
      if (name) convertedNames.add(name);
    }

    // Unique property names from applications
    const propertyNames: string[] = [
      ...new Set<string>(
        apps
          .map((r: any) => String(r.property_name || r.PropertyName || "").trim())
          .filter(Boolean)
      ),
    ].sort();

    // Filter apps by property if requested
    const filteredApps =
      propertyFilter === "all"
        ? apps
        : apps.filter(
            (r: any) =>
              String(r.property_name || r.PropertyName || "").trim() === propertyFilter
          );

    // Build source → counts map
    const bySource = new Map<string, SourceRow>();

    const getOrCreate = (src: string): SourceRow => {
      if (!bySource.has(src)) {
        bySource.set(src, {
          source: src,
          guestCardInquiries: 0,
          showings: 0,
          applications: 0,
          approved: 0,
          converted: 0,
        });
      }
      return bySource.get(src)!;
    };

    for (const r of filteredApps) {
      const src = pickField(r, LEAD_SOURCE_FIELDS) ?? "Direct / Unknown";
      const row = getOrCreate(src);
      row.applications += 1;

      const statusRaw = String(
        r.application_status ??
          r.rental_application_status ??
          r.tenant_status ??
          r.Status ??
          r.status ??
          ""
      )
        .toLowerCase()
        .trim();

      const isApproved =
        statusRaw === "approved" ||
        statusRaw === "approved-future-resident" ||
        statusRaw.startsWith("approved");
      if (isApproved) {
        row.approved += 1;

        // Check if this applicant converted (appears in rent roll)
        const email = String(r.email || r.Email || r.applicant_email || "")
          .toLowerCase()
          .trim();
        const name = String(
          r.applicant_name || r.tenant_name || r.TenantName || r.Name || ""
        )
          .toLowerCase()
          .trim();
        if ((email && convertedEmails.has(email)) || (name && convertedNames.has(name))) {
          row.converted += 1;
        }
      }
    }

    // --- Supabase: showings grouped by source ---
    const sb = getSupabase();
    if (sb) {
      // Pull all registrations (with joined slot for property_name)
      const { data: slotData } = await sb
        .from("showing_slots")
        .select("id, property_name")
        .order("starts_at", { ascending: false });

      if (slotData && slotData.length > 0) {
        const slotPropertyMap = new Map<string, string>(
          slotData.map((s: any) => [s.id, s.property_name ?? ""])
        );

        let regQuery = sb
          .from("showing_registrations")
          .select("slot_id, source, status");

        const { data: regData } = await regQuery;
        for (const reg of regData ?? []) {
          const prop = slotPropertyMap.get(reg.slot_id) ?? "";
          if (propertyFilter !== "all" && prop !== propertyFilter) continue;

          // Only count registered/attended showings (not cancelled)
          const status = String(reg.status ?? "").toLowerCase();
          if (status === "cancelled") continue;

          const src = String(reg.source ?? "").trim() || "Direct / Unknown";
          const row = getOrCreate(src);
          row.showings += 1;
        }
      }
    }

    // Sort: most applications first, then alphabetical
    const rows = [...bySource.values()].sort(
      (a, b) => b.applications - a.applications || a.source.localeCompare(b.source)
    );

    const response: ProspectSourcesResponse = {
      rows,
      properties: propertyNames,
      sourceFieldFound,
      lastUpdated: new Date().toISOString(),
    };

    return NextResponse.json(response);
  } catch (err: any) {
    return NextResponse.json(
      { error: err.message || "Failed to fetch prospect sources" },
      { status: 500 }
    );
  }
}
