// ============================================
// RUBS Meter Mapping CSV Import
// ============================================
// Parses a tab- or comma-separated file of unit-to-meter assignments
// and produces MeterMapping records grouped by (property, meterType, meterId).
//
// Expected columns (header row, case-insensitive, flexible matching):
//   Unit ID - RR        — AppFolio unit ID (becomes unitId in the mapping)
//   Property Name       — property the unit belongs to
//   Unit Name           — display name of the unit
//   Unit ID             — AppFolio internal unit hash (ignored, informational)
//   LADWP Electric Account #
//   LADWP Water Account #
//   SoCal Gas Account #
//
// Multiple meter accounts in a single cell can be separated by commas
// (e.g. "16114167089, 16660550860") — each becomes a distinct meter
// that the unit appears in. At billing time, the unit's total for that
// utility type is the sum of its allocations from each meter.

import * as XLSX from "xlsx";
import type { MeterMapping, MeterType } from "./rubs-types";

export interface CsvParseResult {
  headers: string[];
  rows: Record<string, string>[];
}

// ─── Excel (xlsx / xlsm / xls) Parser ──────────────────────────

/**
 * Parse an Excel workbook (binary ArrayBuffer) into the same shape as parseCsvText.
 * Reads the first sheet that contains a `Property Name` (or similar) column,
 * falling back to the first sheet in the workbook if none match.
 */
export function parseExcelBuffer(buffer: ArrayBuffer): CsvParseResult {
  const workbook = XLSX.read(buffer, { type: "array", cellDates: false, cellNF: false });

  // Find the best sheet — prefer one with a recognizable header
  let bestSheetName = workbook.SheetNames[0];
  for (const name of workbook.SheetNames) {
    const sheet = workbook.Sheets[name];
    const rows = XLSX.utils.sheet_to_json<any[]>(sheet, { header: 1, blankrows: false, defval: "" });
    if (rows.length === 0) continue;
    const headerRow = (rows[0] as any[]).map((v) => String(v).toLowerCase());
    if (headerRow.some((h) => h.includes("property") || h.includes("unit id"))) {
      bestSheetName = name;
      break;
    }
  }

  const sheet = workbook.Sheets[bestSheetName];
  // header: 1 → array-of-arrays so we control header parsing
  // raw: false → string conversion (avoids scientific notation on long numbers)
  // defval: "" → empty cells become empty strings instead of undefined
  const rawRows = XLSX.utils.sheet_to_json<any[]>(sheet, {
    header: 1,
    blankrows: false,
    defval: "",
    raw: false,
  });

  if (rawRows.length === 0) return { headers: [], rows: [] };

  const headers = (rawRows[0] as any[]).map((v) => String(v ?? "").trim());
  const rows: Record<string, string>[] = [];
  for (let i = 1; i < rawRows.length; i++) {
    const values = rawRows[i] as any[];
    if (!values || values.length === 0) continue;
    const row: Record<string, string> = {};
    headers.forEach((h, idx) => {
      const cell = values[idx];
      // Convert everything to string, normalize whitespace
      row[h] = cell === null || cell === undefined ? "" : String(cell).trim();
    });
    rows.push(row);
  }

  return { headers, rows };
}

/**
 * Detect the file type by extension and dispatch to the right parser.
 * Returns a normalized CsvParseResult regardless of source format.
 */
export async function parseImportFile(file: File): Promise<CsvParseResult> {
  const name = file.name.toLowerCase();
  if (name.endsWith(".xlsx") || name.endsWith(".xlsm") || name.endsWith(".xls") || name.endsWith(".xlsb")) {
    const buf = await file.arrayBuffer();
    return parseExcelBuffer(buf);
  }
  // Default: treat as text (CSV / TSV / plain)
  const text = await file.text();
  return parseCsvText(text);
}

export interface ImportResult {
  mappings: MeterMapping[];
  rowsProcessed: number;
  rowsSkipped: number;
  warnings: string[];
}

// ─── CSV / TSV Parser ──────────────────────────────────────────

export function parseCsvText(text: string): CsvParseResult {
  // Normalize line endings, drop blank lines
  const lines = text.replace(/\r\n/g, "\n").split("\n").filter((l) => l.length > 0);
  if (lines.length === 0) return { headers: [], rows: [] };

  // Auto-detect delimiter by counting in the header line
  const firstLine = lines[0];
  const tabCount = (firstLine.match(/\t/g) || []).length;
  const commaCount = (firstLine.match(/,/g) || []).length;
  const delim = tabCount > commaCount ? "\t" : ",";

  const parseLine = (line: string): string[] => {
    const fields: string[] = [];
    let current = "";
    let inQuotes = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (ch === '"') {
        if (inQuotes && line[i + 1] === '"') {
          // escaped quote
          current += '"';
          i++;
        } else {
          inQuotes = !inQuotes;
        }
      } else if (ch === delim && !inQuotes) {
        fields.push(current.trim());
        current = "";
      } else {
        current += ch;
      }
    }
    fields.push(current.trim());
    return fields;
  };

  const headers = parseLine(lines[0]);
  const rows = lines.slice(1).map((line) => {
    const values = parseLine(line);
    const row: Record<string, string> = {};
    headers.forEach((h, i) => {
      row[h] = values[i] || "";
    });
    return row;
  });

  return { headers, rows };
}

// ─── Header Matching ───────────────────────────────────────────

/** Find a header that matches any of the given patterns (case-insensitive, ignores spaces/punctuation) */
function findHeader(headers: string[], patterns: string[]): string | null {
  const norm = (s: string) => s.toLowerCase().replace(/[\s_\-#]/g, "");
  const normHeaders = headers.map((h) => ({ original: h, normalized: norm(h) }));
  for (const pattern of patterns) {
    const np = norm(pattern);
    const match = normHeaders.find((h) => h.normalized === np || h.normalized.includes(np));
    if (match) return match.original;
  }
  return null;
}

// ─── Transform Rows to MeterMappings ───────────────────────────

export function transformRowsToMappings(parseResult: CsvParseResult): ImportResult {
  const { headers, rows } = parseResult;
  const warnings: string[] = [];

  // Identify column names
  const colUnitId = findHeader(headers, ["Unit ID - RR", "UnitIDRR", "Unit ID RR"]);
  const colProperty = findHeader(headers, ["Property Name", "Property"]);
  const colUnitName = findHeader(headers, ["Unit Name", "Unit"]);
  const colElectric = findHeader(headers, ["LADWP Electric Account", "Electric Account", "Electric"]);
  const colWater = findHeader(headers, ["LADWP Water Account", "Water Account", "Water"]);
  const colGas = findHeader(headers, ["SoCal Gas Account", "Gas Account", "Gas"]);

  if (!colUnitId) warnings.push('Required column "Unit ID - RR" not found');
  if (!colProperty) warnings.push('Required column "Property Name" not found');
  if (!colElectric && !colWater && !colGas) {
    warnings.push("No utility account columns found (electric/water/gas)");
  }

  // Group key: `${propertyName}|${meterType}|${accountNumber}`
  // Value: { propertyName, meterType, meterId, unitIds: Set<string> }
  type Group = {
    propertyName: string;
    meterType: MeterType;
    meterId: string;
    unitIds: Set<string>;
    unitNames: Set<string>;
  };
  const groups = new Map<string, Group>();

  let rowsProcessed = 0;
  let rowsSkipped = 0;

  for (const row of rows) {
    const unitId = colUnitId ? row[colUnitId]?.trim() : "";
    const propertyName = colProperty ? row[colProperty]?.trim() : "";
    const unitName = colUnitName ? row[colUnitName]?.trim() : "";

    // Skip rows with no property name or no unit ID
    if (!propertyName || !unitId) {
      rowsSkipped++;
      continue;
    }
    rowsProcessed++;

    const utilityCols: { type: MeterType; col: string | null }[] = [
      { type: "electric", col: colElectric },
      { type: "water", col: colWater },
      { type: "gas", col: colGas },
    ];

    for (const { type, col } of utilityCols) {
      if (!col) continue;
      const raw = row[col]?.trim();
      if (!raw) continue;

      // Parse multiple account numbers separated by commas
      const accounts = raw
        .split(",")
        .map((a) => a.trim())
        // Strip trailing .00 from decimal artifacts (Excel formatting)
        .map((a) => a.replace(/\.0+$/, ""))
        .filter((a) => a.length > 0);

      for (const acct of accounts) {
        const key = `${propertyName}|${type}|${acct}`;
        if (!groups.has(key)) {
          groups.set(key, {
            propertyName,
            meterType: type,
            meterId: acct,
            unitIds: new Set(),
            unitNames: new Set(),
          });
        }
        const g = groups.get(key)!;
        g.unitIds.add(unitId);
        if (unitName) g.unitNames.add(unitName);
      }
    }
  }

  if (rowsSkipped > 0) {
    warnings.push(`${rowsSkipped} row${rowsSkipped !== 1 ? "s" : ""} skipped (missing Property Name or Unit ID)`);
  }

  // Convert groups to MeterMappings
  const mappings: MeterMapping[] = Array.from(groups.values()).map((g) => {
    const unitIds = Array.from(g.unitIds);
    const meteringMethod = unitIds.length > 1 ? "master" : "sub_metered";
    // Default split: occupancy (weighted by actual tenant count per unit).
    // User can bulk-update later via the settings page if a different
    // method is preferred for specific meters.
    const splitMethod = "occupancy";
    return {
      id: `mapping-csv-${slug(g.propertyName)}-${g.meterType}-${slug(g.meterId)}`,
      propertyName: g.propertyName,
      meterType: g.meterType,
      meteringMethod,
      meterId: g.meterId,
      unitIds,
      splitMethod,
    };
  });

  return { mappings, rowsProcessed, rowsSkipped, warnings };
}

function slug(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
}
