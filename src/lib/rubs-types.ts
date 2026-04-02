// ============================================
// RUBS (Ratio Utility Billing System) — Types
// ============================================

export type MeterType = "water" | "gas" | "electric" | "trash";
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
  trash: "Trash",
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
