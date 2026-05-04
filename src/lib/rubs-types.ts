// ============================================
// RUBS (Ratio Utility Billing System) — Types
// ============================================

export type MeterType = "water" | "gas" | "electric" | "sewer" | "unknown";
export type MeteringMethod = "master" | "sub_metered";
export type SplitMethod = "sqft" | "occupancy" | "equal" | "custom";
export type BillStatus = "draft" | "calculated" | "posted";

export interface MeterMapping {
  id: string;
  propertyName: string;
  meterType: MeterType;
  meteringMethod: MeteringMethod;
  meterId: string; // utility account or meter number
  unitIds: string[]; // units served by this meter
  splitMethod: SplitMethod;
  customShares?: Record<string, number>; // unitId → percentage (0-100) for custom splits
  /**
   * When true, vacant units are excluded from the split entirely — the
   * owner absorbs the vacant share rather than spreading it across the
   * remaining tenants. Defaults to false (vacant units pay their share
   * for sqft/equal splits; for occupancy splits vacant units already
   * pay nothing because their occupant count is 0).
   */
  ownerAbsorbsVacancy?: boolean;
}

export interface RubsBill {
  id: string;
  propertyName: string;
  month: string; // "2026-03"
  meterType: MeterType;
  totalAmount: number;
  mappingId: string; // links to MeterMapping
  status: BillStatus;
  allocations: RubsAllocation[];
  /** Relative path to the source PDF in the bills folder, e.g. "2026-04/LADWP/acct1.pdf" */
  sourceFile?: string;
  /** SHA-256 hex digest of the source PDF. Used for duplicate detection. */
  fileHash?: string;
  /** Inclusive billing period start (YYYY-MM-DD), if known. */
  servicePeriodStart?: string;
  /** Inclusive billing period end (YYYY-MM-DD), if known. */
  servicePeriodEnd?: string;
  createdAt: string;
  updatedAt: string;
}

export interface RubsAllocation {
  unitId: string;
  unitName: string;
  tenant: string;
  sqft: number;
  occupants: number;
  share: number; // 0–1 decimal
  amount: number; // dollar amount
}

// Labels for display
export const METER_TYPE_LABELS: Record<MeterType, string> = {
  water: "Water",
  gas: "Gas",
  electric: "Electric",
  sewer: "Sewer",
  unknown: "Unknown",
};

export const SPLIT_METHOD_LABELS: Record<SplitMethod, string> = {
  sqft: "By Square Footage",
  occupancy: "By Occupancy",
  equal: "Equal Split",
  custom: "Custom Percentages",
};

export const METERING_METHOD_LABELS: Record<MeteringMethod, string> = {
  master: "Master Metered",
  sub_metered: "Sub-Metered",
};

// ─── Bill Import / AI Parsing ──────────────────────────────────

export interface ParsedBill {
  utilityProvider: string;
  serviceAddress: string;
  matchedProperty: string | null;
  totalAmount: number;
  billingPeriod: string; // YYYY-MM
  meterType: MeterType;
  accountNumber: string;
  confidence: number; // 0–1
  /** How the property was matched. Helps the UI explain low-confidence rows. */
  matchedVia?: "address" | "alias" | "fuzzy" | "none";
  sourceFile: string;
  /** SHA-256 hex of the source PDF, propagated through parsing. */
  fileHash?: string;
  /** Service period start as YYYY-MM-DD, if extracted. */
  servicePeriodStart?: string;
  /** Service period end as YYYY-MM-DD, if extracted. */
  servicePeriodEnd?: string;
}

export interface ImportFileInfo {
  name: string;
  size: number;
  modified: string;
}

// ─── AppFolio Occupancy Mapping ────────────────────────────────
// Parsed from the AppFolio "Bulk Charges and Credits" template CSV.
// Maps each tenant-on-unit to an Occupancy UID for posting charges.

export interface OccupancyRecord {
  propertyName: string;
  unitName: string;
  occupancyUid: string; // e.g. "#2405955681019495333"
  tenantName: string;
  occupancyId: string; // numeric e.g. "1342"
}

export interface OccupancyData {
  records: OccupancyRecord[];
  importedAt: string; // ISO timestamp
  filename: string;
}

// ─── Property Aliases ──────────────────────────────────────────
// A canonical property name + list of alternate names that refer to the
// same physical property. Used to match bills, meter mappings, occupancy
// records, and AppFolio exports across spelling differences.

export interface PropertyAlias {
  id: string;
  /** The one name we prefer to display + match against */
  canonicalName: string;
  /** Alternate names: LLC names, address variants, utility bill formatting, etc. */
  aliases: string[];
  /** Optional notes */
  notes?: string;
}

// ─── AppFolio Export / Reconciliation ──────────────────────────

export interface ReconciliationIssue {
  type: "missing_occupancy" | "missing_mapping" | "name_mismatch" | "stale_template";
  severity: "error" | "warning";
  message: string;
  property?: string;
  unit?: string;
}

export interface AppFolioExportRow {
  propertyName: string;
  unitName: string;
  occupancyUid: string;
  tenantName: string;
  occupancyId: string;
  amount: string; // formatted to 2 decimal places
  description: string;
}
