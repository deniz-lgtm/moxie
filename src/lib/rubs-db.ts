// ============================================
// RUBS Data Layer — localStorage persistence
// ============================================
// Follows the same pattern as inspections-db.ts.
// All RUBS CRUD goes through here.

import { loadFromStorage, saveToStorage } from "./storage";
import type { MeterMapping, RubsBill, OccupancyData, PropertyAlias } from "./rubs-types";

const MAPPINGS_KEY = "rubs_mappings";
const BILLS_KEY = "rubs_bills";
const OCCUPANCY_KEY = "rubs_occupancy";
const ALIASES_KEY = "rubs_property_aliases";

// ─── Meter Mappings ────────────────────────────────────────────

export function getMeterMappings(): MeterMapping[] {
  return loadFromStorage<MeterMapping[]>(MAPPINGS_KEY, []);
}

export function getMeterMappingById(id: string): MeterMapping | undefined {
  return getMeterMappings().find((m) => m.id === id);
}

export function getMeterMappingsByProperty(propertyName: string): MeterMapping[] {
  return getMeterMappings().filter((m) => m.propertyName === propertyName);
}

export function saveMeterMapping(mapping: MeterMapping): void {
  const all = getMeterMappings();
  const idx = all.findIndex((m) => m.id === mapping.id);
  if (idx >= 0) {
    all[idx] = mapping;
  } else {
    all.push(mapping);
  }
  saveToStorage(MAPPINGS_KEY, all);
}

export function deleteMeterMapping(id: string): void {
  const all = getMeterMappings().filter((m) => m.id !== id);
  saveToStorage(MAPPINGS_KEY, all);
}

// ─── Bills ─────────────────────────────────────────────────────

export function getBills(): RubsBill[] {
  return loadFromStorage<RubsBill[]>(BILLS_KEY, []);
}

export function getBillById(id: string): RubsBill | undefined {
  return getBills().find((b) => b.id === id);
}

export function getBillsFiltered(filters?: { month?: string; propertyName?: string }): RubsBill[] {
  let bills = getBills();
  if (filters?.month) {
    bills = bills.filter((b) => b.month === filters.month);
  }
  if (filters?.propertyName) {
    bills = bills.filter((b) => b.propertyName === filters.propertyName);
  }
  return bills;
}

export function saveBill(bill: RubsBill): void {
  const all = getBills();
  const idx = all.findIndex((b) => b.id === bill.id);
  if (idx >= 0) {
    all[idx] = { ...bill, updatedAt: new Date().toISOString() };
  } else {
    all.push(bill);
  }
  saveToStorage(BILLS_KEY, all);
}

export function deleteBill(id: string): void {
  const all = getBills().filter((b) => b.id !== id);
  saveToStorage(BILLS_KEY, all);
}

// ─── Occupancy Data (AppFolio Template) ────────────────────────

export function getOccupancyData(): OccupancyData | null {
  return loadFromStorage<OccupancyData | null>(OCCUPANCY_KEY, null);
}

export function saveOccupancyData(data: OccupancyData): void {
  saveToStorage(OCCUPANCY_KEY, data);
}

export function clearOccupancyData(): void {
  saveToStorage(OCCUPANCY_KEY, null);
}

// ─── Property Aliases ──────────────────────────────────────────

export function getPropertyAliases(): PropertyAlias[] {
  return loadFromStorage<PropertyAlias[]>(ALIASES_KEY, []);
}

export function savePropertyAlias(alias: PropertyAlias): void {
  const all = getPropertyAliases();
  const idx = all.findIndex((a) => a.id === alias.id);
  if (idx >= 0) all[idx] = alias;
  else all.push(alias);
  saveToStorage(ALIASES_KEY, all);
}

export function deletePropertyAlias(id: string): void {
  saveToStorage(
    ALIASES_KEY,
    getPropertyAliases().filter((a) => a.id !== id)
  );
}

export function clearPropertyAliases(): void {
  saveToStorage(ALIASES_KEY, []);
}

// ─── Seed helpers ──────────────────────────────────────────────

export function isSeeded(): boolean {
  return getMeterMappings().length > 0;
}

export function clearAllRubsData(): void {
  saveToStorage(MAPPINGS_KEY, []);
  saveToStorage(BILLS_KEY, []);
}
