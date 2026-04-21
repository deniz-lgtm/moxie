// ============================================
// RUBS AppFolio Export — Template Parser, Reconciliation, CSV Generation
// ============================================
// Handles the final step of the RUBS workflow:
// 1. Parse the AppFolio "Bulk Charges and Credits" template (tab-separated)
// 2. Reconcile occupancy UIDs against meter mapping unit IDs
// 3. Generate filled-out CSVs (one per utility) ready for AppFolio upload

import type {
  OccupancyRecord,
  OccupancyData,
  ReconciliationIssue,
  AppFolioExportRow,
  RubsBill,
  MeterType,
  PropertyAlias,
} from "./rubs-types";
import { parseCsvText, parseExcelBuffer } from "./rubs-csv-import";
import { buildAliasMap, resolvePropertyName, normalizePropertyName } from "./rubs-property-resolver";

// ─── Template Parser ───────────────────────────────────────────

/**
 * Parse the AppFolio "Bulk Charges" template into OccupancyRecords.
 * The template is a tab-separated file with columns:
 *   Property Name, Unit Name, Occupancy UID, Tenant Name, Occupancy ID, Amount, Description
 */
export async function parseAppFolioTemplate(file: File): Promise<OccupancyData> {
  const name = file.name.toLowerCase();
  let parsed;
  if (name.endsWith(".xlsx") || name.endsWith(".xlsm") || name.endsWith(".xls")) {
    const { parseExcelBuffer: excelParse } = await import("./rubs-csv-import");
    const buf = await file.arrayBuffer();
    parsed = excelParse(buf);
  } else {
    const text = await file.text();
    parsed = parseCsvText(text);
  }

  const { headers, rows } = parsed;

  // Flexible header matching
  const norm = (s: string) => s.toLowerCase().replace(/[\s_\-#]/g, "");
  const findCol = (patterns: string[]): string | null => {
    for (const p of patterns) {
      const np = norm(p);
      const match = headers.find((h) => norm(h) === np || norm(h).includes(np));
      if (match) return match;
    }
    return null;
  };

  const colProperty = findCol(["Property Name", "Property"]);
  const colUnit = findCol(["Unit Name", "Unit"]);
  const colOccUid = findCol(["Occupancy UID", "OccupancyUID"]);
  const colTenant = findCol(["Tenant Name", "Tenant"]);
  const colOccId = findCol(["Occupancy ID", "OccupancyID"]);

  if (!colOccUid) {
    throw new Error('Could not find "Occupancy UID" column in the template. Expected columns: Property Name, Unit Name, Occupancy UID, Tenant Name, Occupancy ID');
  }

  const records: OccupancyRecord[] = [];
  for (const row of rows) {
    const occUid = (colOccUid ? row[colOccUid] : "")?.trim();
    if (!occUid) continue; // skip rows with no occupancy UID

    records.push({
      propertyName: (colProperty ? row[colProperty] : "")?.trim() || "",
      unitName: (colUnit ? row[colUnit] : "")?.trim() || "",
      occupancyUid: occUid,
      tenantName: (colTenant ? row[colTenant] : "")?.trim() || "",
      occupancyId: (colOccId ? row[colOccId] : "")?.trim() || "",
    });
  }

  return {
    records,
    importedAt: new Date().toISOString(),
    filename: file.name,
  };
}

// ─── Reconciliation ────────────────────────────────────────────

/**
 * Normalize a name for comparison: lowercase, strip extra whitespace, strip
 * common suffixes, strip unicode artifacts from Excel encoding issues.
 */
function normName(s: string): string {
  return s
    .toLowerCase()
    .replace(/[\u00c2\u00e2\u00bd\u00be\u00bc\u2013\u2014\u201c\u201d]/g, "") // unicode artifacts
    .replace(/\s+/g, " ")
    .trim();
}

export interface ReconciliationResult {
  issues: ReconciliationIssue[];
  matchedCount: number;
  unmatchedAllocations: { property: string; unit: string; tenant: string }[];
  templateAge: number; // days since template was imported
}

/**
 * Check that every allocation in the given bills can be matched to an
 * Occupancy UID from the template. Returns a detailed list of issues.
 */
export function reconcile(
  bills: RubsBill[],
  occupancy: OccupancyData | null,
  aliases: PropertyAlias[] = []
): ReconciliationResult {
  const aliasMap = buildAliasMap(aliases);
  const issues: ReconciliationIssue[] = [];
  const unmatchedAllocations: { property: string; unit: string; tenant: string }[] = [];
  let matchedCount = 0;

  // Check template freshness
  let templateAge = Infinity;
  if (!occupancy || occupancy.records.length === 0) {
    issues.push({
      type: "stale_template",
      severity: "error",
      message: "No AppFolio template loaded. Upload the Bulk Charges template from AppFolio before exporting.",
    });
    return { issues, matchedCount: 0, unmatchedAllocations: [], templateAge: Infinity };
  }

  templateAge = Math.floor(
    (Date.now() - new Date(occupancy.importedAt).getTime()) / (1000 * 60 * 60 * 24)
  );
  if (templateAge > 30) {
    issues.push({
      type: "stale_template",
      severity: "warning",
      message: `AppFolio template is ${templateAge} days old (imported ${new Date(occupancy.importedAt).toLocaleDateString()}). Download a fresh template to ensure Occupancy UIDs are current.`,
    });
  }

  // Build lookup: canonical-property-normalized | unit-normalized → OccupancyRecord
  // Using the alias-resolved canonical name means "Dorr Holdings -1 LLC" and
  // "1006 W. 23rd St" match to the same slot.
  const lookup = new Map<string, OccupancyRecord>();
  for (const rec of occupancy.records) {
    const canonical = resolvePropertyName(rec.propertyName, aliasMap);
    const key = `${normalizePropertyName(canonical)}|${normName(rec.unitName)}`;
    lookup.set(key, rec);
  }

  // Check each bill's allocations
  const calculatedBills = bills.filter((b) => b.status === "calculated" || b.status === "posted");
  for (const bill of calculatedBills) {
    for (const alloc of bill.allocations) {
      if (alloc.amount <= 0) continue; // skip $0 allocations (vacant units)

      const canonicalBillProp = resolvePropertyName(bill.propertyName, aliasMap);
      const key = `${normalizePropertyName(canonicalBillProp)}|${normName(alloc.unitName)}`;
      const match = lookup.get(key);

      if (match) {
        matchedCount++;
      } else {
        // Try fuzzy match — maybe the property name or unit name differs slightly
        const fuzzyKey = findFuzzyMatch(bill.propertyName, alloc.unitName, occupancy.records, aliasMap);
        if (fuzzyKey) {
          matchedCount++;
          issues.push({
            type: "name_mismatch",
            severity: "warning",
            message: `"${bill.propertyName} / ${alloc.unitName}" matched to "${fuzzyKey.propertyName} / ${fuzzyKey.unitName}" via fuzzy matching. Verify this is correct.`,
            property: bill.propertyName,
            unit: alloc.unitName,
          });
        } else {
          unmatchedAllocations.push({
            property: bill.propertyName,
            unit: alloc.unitName,
            tenant: alloc.tenant,
          });
          issues.push({
            type: "missing_occupancy",
            severity: "error",
            message: `No Occupancy UID found for "${bill.propertyName} / ${alloc.unitName}" (${alloc.tenant}). This tenant will be MISSING from the AppFolio export.`,
            property: bill.propertyName,
            unit: alloc.unitName,
          });
        }
      }
    }
  }

  return { issues, matchedCount, unmatchedAllocations, templateAge };
}

function findFuzzyMatch(
  property: string,
  unit: string,
  records: OccupancyRecord[],
  aliasMap: Map<string, string> = new Map()
): OccupancyRecord | null {
  // Use alias-resolved canonical names on both sides for comparison
  const canonicalIn = resolvePropertyName(property, aliasMap);
  const normProp = normalizePropertyName(canonicalIn);
  const normUnit = normName(unit);

  // Extract just the street number from both sides for comparison
  const unitNum = normUnit.match(/^(\d+)/)?.[1];

  for (const rec of records) {
    const canonicalRec = resolvePropertyName(rec.propertyName, aliasMap);
    const recProp = normalizePropertyName(canonicalRec);
    const recUnit = normName(rec.unitName);

    // Exact property match but unit is close
    if (recProp === normProp || normProp.includes(recProp) || recProp.includes(normProp)) {
      if (recUnit === normUnit) return rec;
      // Check if the unit numbers match
      const recUnitNum = recUnit.match(/^(\d+)/)?.[1];
      if (unitNum && recUnitNum && unitNum === recUnitNum && Math.abs(recUnit.length - normUnit.length) < 5) {
        return rec;
      }
    }
  }
  return null;
}

// ─── CSV Generation ────────────────────────────────────────────

/**
 * Generate a filled-out AppFolio Bulk Charges CSV for a specific utility type.
 * Returns the CSV content as a string, ready for download.
 */
export function generateAppFolioExport(
  bills: RubsBill[],
  utilityType: MeterType,
  occupancy: OccupancyData,
  billingMonth: string, // e.g. "2026-04"
  aliases: PropertyAlias[] = []
): { csv: string; rows: AppFolioExportRow[]; errors: string[] } {
  const errors: string[] = [];
  const aliasMap = buildAliasMap(aliases);
  const utilityBills = bills.filter(
    (b) => b.meterType === utilityType && (b.status === "calculated" || b.status === "posted")
  );

  if (utilityBills.length === 0) {
    return { csv: "", rows: [], errors: [`No calculated ${utilityType} bills found`] };
  }

  // Build lookup keyed by canonical property name (alias-resolved) + unit
  const lookup = new Map<string, OccupancyRecord>();
  for (const rec of occupancy.records) {
    const canonical = resolvePropertyName(rec.propertyName, aliasMap);
    const key = `${normalizePropertyName(canonical)}|${normName(rec.unitName)}`;
    lookup.set(key, rec);
  }

  const utilityLabels: Record<MeterType, string> = {
    water: "Water",
    gas: "Gas",
    electric: "Electric",
    sewer: "Sewer",
  };

  const description = `${utilityLabels[utilityType]} RUBS - ${billingMonth}`;
  const exportRows: AppFolioExportRow[] = [];

  for (const bill of utilityBills) {
    for (const alloc of bill.allocations) {
      if (alloc.amount <= 0) continue; // skip $0

      const canonicalBillProp = resolvePropertyName(bill.propertyName, aliasMap);
      const key = `${normalizePropertyName(canonicalBillProp)}|${normName(alloc.unitName)}`;
      let match = lookup.get(key);

      // Try fuzzy
      if (!match) {
        match = findFuzzyMatch(bill.propertyName, alloc.unitName, occupancy.records, aliasMap) || undefined;
      }

      if (!match) {
        errors.push(`No Occupancy UID for ${bill.propertyName} / ${alloc.unitName} ($${alloc.amount.toFixed(2)}) — SKIPPED`);
        continue;
      }

      exportRows.push({
        propertyName: match.propertyName,
        unitName: match.unitName,
        occupancyUid: match.occupancyUid,
        tenantName: match.tenantName,
        occupancyId: match.occupancyId,
        amount: alloc.amount.toFixed(2),
        description,
      });
    }
  }

  // Generate tab-separated CSV matching AppFolio's format
  const headers = ["Property Name", "Unit Name", "Occupancy UID", "Tenant Name", "Occupancy ID", "Amount", "Description"];
  const lines = [
    headers.join("\t"),
    ...exportRows.map((r) => [
      r.propertyName,
      r.unitName,
      r.occupancyUid,
      r.tenantName,
      r.occupancyId,
      r.amount,
      r.description,
    ].join("\t")),
  ];

  return { csv: lines.join("\n"), rows: exportRows, errors };
}

/**
 * Calculate the total amount being exported for a given utility type.
 */
export function getExportTotal(rows: AppFolioExportRow[]): number {
  return rows.reduce((sum, r) => sum + parseFloat(r.amount), 0);
}
