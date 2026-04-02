// ============================================
// RUBS Seed Data — Sample meter mappings & bills
// ============================================
// Populates localStorage with realistic demo data for USC-area
// student housing properties. Call seedRubsData() from the UI
// or the /api/rubs/seed endpoint.

import type { MeterMapping, RubsBill, RubsAllocation } from "./rubs-types";
import { saveMeterMapping, saveBill, isSeeded, clearAllRubsData } from "./rubs-db";

// ─── Property Configurations ───────────────────────────────────
// Each property has meter mappings and sample unit IDs.
// Unit IDs use the format "prop-unitN" since real AppFolio IDs
// won't be available until the page loads. The page will match
// by propertyName and merge with live AppFolio data.

interface PropertyConfig {
  name: string;
  units: { id: string; name: string }[];
  meters: Omit<MeterMapping, "id" | "propertyName" | "unitIds">[];
}

const PROPERTIES: PropertyConfig[] = [
  {
    name: "2614 Ellendale Pl",
    units: [
      { id: "ell-1", name: "Unit 1" },
      { id: "ell-2", name: "Unit 2" },
      { id: "ell-3", name: "Unit 3" },
      { id: "ell-4", name: "Unit 4" },
      { id: "ell-5", name: "Unit 5" },
      { id: "ell-6", name: "Unit 6" },
    ],
    meters: [
      { meterType: "water", meteringMethod: "master", meterId: "WTR-ELL-001", splitMethod: "sqft" },
      { meterType: "gas", meteringMethod: "master", meterId: "GAS-ELL-001", splitMethod: "sqft" },
      { meterType: "trash", meteringMethod: "master", meterId: "TRS-ELL-001", splitMethod: "equal" },
    ],
  },
  {
    name: "1249 W 30th St",
    units: [
      { id: "30th-1", name: "Unit 1" },
      { id: "30th-2", name: "Unit 2" },
      { id: "30th-3", name: "Unit 3" },
      { id: "30th-4", name: "Unit 4" },
      { id: "30th-5", name: "Unit 5" },
      { id: "30th-6", name: "Unit 6" },
      { id: "30th-7", name: "Unit 7" },
      { id: "30th-8", name: "Unit 8" },
    ],
    meters: [
      { meterType: "water", meteringMethod: "master", meterId: "WTR-30TH-001", splitMethod: "occupancy" },
      { meterType: "gas", meteringMethod: "master", meterId: "GAS-30TH-001", splitMethod: "sqft" },
      { meterType: "electric", meteringMethod: "sub_metered", meterId: "ELEC-30TH-SUB", splitMethod: "equal" },
      { meterType: "trash", meteringMethod: "master", meterId: "TRS-30TH-001", splitMethod: "equal" },
    ],
  },
  {
    name: "1037 W 27th St",
    units: [
      { id: "27th-1", name: "Unit A" },
      { id: "27th-2", name: "Unit B" },
      { id: "27th-3", name: "Unit C" },
      { id: "27th-4", name: "Unit D" },
    ],
    meters: [
      { meterType: "water", meteringMethod: "master", meterId: "WTR-27TH-001", splitMethod: "sqft" },
      { meterType: "gas", meteringMethod: "master", meterId: "GAS-27TH-001", splitMethod: "equal" },
      { meterType: "trash", meteringMethod: "master", meterId: "TRS-27TH-001", splitMethod: "equal" },
    ],
  },
  {
    name: "2701 S Hoover St",
    units: [
      { id: "hoo-1", name: "101" },
      { id: "hoo-2", name: "102" },
      { id: "hoo-3", name: "103" },
      { id: "hoo-4", name: "201" },
      { id: "hoo-5", name: "202" },
      { id: "hoo-6", name: "203" },
      { id: "hoo-7", name: "301" },
      { id: "hoo-8", name: "302" },
      { id: "hoo-9", name: "303" },
      { id: "hoo-10", name: "304" },
    ],
    meters: [
      { meterType: "water", meteringMethod: "master", meterId: "WTR-HOO-001", splitMethod: "sqft" },
      { meterType: "gas", meteringMethod: "master", meterId: "GAS-HOO-001", splitMethod: "sqft" },
      { meterType: "electric", meteringMethod: "master", meterId: "ELEC-HOO-001", splitMethod: "sqft" },
      { meterType: "trash", meteringMethod: "master", meterId: "TRS-HOO-001", splitMethod: "equal" },
    ],
  },
  {
    name: "955 W 27th St",
    units: [
      { id: "955-1", name: "Unit 1" },
      { id: "955-2", name: "Unit 2" },
      { id: "955-3", name: "Unit 3" },
      { id: "955-4", name: "Unit 4" },
      { id: "955-5", name: "Unit 5" },
    ],
    meters: [
      { meterType: "water", meteringMethod: "master", meterId: "WTR-955-001", splitMethod: "occupancy" },
      { meterType: "gas", meteringMethod: "master", meterId: "GAS-955-001", splitMethod: "occupancy" },
      { meterType: "trash", meteringMethod: "master", meterId: "TRS-955-001", splitMethod: "equal" },
    ],
  },
  {
    name: "1234 W Adams Blvd",
    units: [
      { id: "ada-1", name: "1" },
      { id: "ada-2", name: "2" },
      { id: "ada-3", name: "3" },
      { id: "ada-4", name: "4" },
      { id: "ada-5", name: "5" },
      { id: "ada-6", name: "6" },
      { id: "ada-7", name: "7" },
      { id: "ada-8", name: "8" },
      { id: "ada-9", name: "9" },
      { id: "ada-10", name: "10" },
      { id: "ada-11", name: "11" },
      { id: "ada-12", name: "12" },
    ],
    meters: [
      { meterType: "water", meteringMethod: "master", meterId: "WTR-ADA-001", splitMethod: "sqft" },
      { meterType: "gas", meteringMethod: "master", meterId: "GAS-ADA-001", splitMethod: "sqft" },
      { meterType: "electric", meteringMethod: "sub_metered", meterId: "ELEC-ADA-SUB", splitMethod: "equal" },
      { meterType: "trash", meteringMethod: "master", meterId: "TRS-ADA-001", splitMethod: "equal" },
    ],
  },
  {
    name: "2820 S Figueroa St",
    units: [
      { id: "fig-1", name: "A" },
      { id: "fig-2", name: "B" },
      { id: "fig-3", name: "C" },
      { id: "fig-4", name: "D" },
      { id: "fig-5", name: "E" },
      { id: "fig-6", name: "F" },
    ],
    meters: [
      { meterType: "water", meteringMethod: "master", meterId: "WTR-FIG-001", splitMethod: "sqft" },
      { meterType: "gas", meteringMethod: "master", meterId: "GAS-FIG-001", splitMethod: "equal" },
      { meterType: "trash", meteringMethod: "master", meterId: "TRS-FIG-001", splitMethod: "equal" },
    ],
  },
  {
    name: "1818 W 28th St",
    units: [
      { id: "28th-1", name: "Unit 1" },
      { id: "28th-2", name: "Unit 2" },
      { id: "28th-3", name: "Unit 3" },
      { id: "28th-4", name: "Unit 4" },
      { id: "28th-5", name: "Unit 5" },
      { id: "28th-6", name: "Unit 6" },
      { id: "28th-7", name: "Unit 7" },
      { id: "28th-8", name: "Unit 8" },
      { id: "28th-9", name: "Unit 9" },
      { id: "28th-10", name: "Unit 10" },
    ],
    meters: [
      { meterType: "water", meteringMethod: "master", meterId: "WTR-28TH-001", splitMethod: "sqft" },
      { meterType: "gas", meteringMethod: "master", meterId: "GAS-28TH-001", splitMethod: "sqft" },
      { meterType: "electric", meteringMethod: "master", meterId: "ELEC-28TH-001", splitMethod: "occupancy" },
      { meterType: "trash", meteringMethod: "master", meterId: "TRS-28TH-001", splitMethod: "equal" },
    ],
  },
];

// ─── Sample bill amounts (realistic LA utility costs) ──────────
// Monthly ranges: Water $400-900, Gas $200-600, Electric $300-800, Trash $150-300
const BILL_AMOUNTS: Record<string, Record<string, number>> = {
  "2026-01": { water: 680, gas: 420, electric: 540, trash: 210 },
  "2026-02": { water: 720, gas: 380, electric: 490, trash: 210 },
  "2026-03": { water: 650, gas: 350, electric: 520, trash: 210 },
};

function generateBillAmount(baseCost: number, unitCount: number): number {
  // Scale base cost by unit count with some variance
  const scale = unitCount / 6; // normalized to a 6-unit building
  const variance = 0.85 + Math.random() * 0.3; // +-15% variance
  return Math.round(baseCost * scale * variance * 100) / 100;
}

// ─── Seed Function ─────────────────────────────────────────────

export function seedRubsData(): { mappings: number; bills: number } {
  clearAllRubsData();

  let mappingCount = 0;
  let billCount = 0;

  for (const prop of PROPERTIES) {
    const unitIds = prop.units.map((u) => u.id);

    // Create meter mappings
    for (const meter of prop.meters) {
      const mapping: MeterMapping = {
        id: `mapping-${prop.name.replace(/\s/g, "-").toLowerCase()}-${meter.meterType}`,
        propertyName: prop.name,
        meterType: meter.meterType,
        meteringMethod: meter.meteringMethod,
        meterId: meter.meterId,
        unitIds,
        splitMethod: meter.splitMethod,
      };
      saveMeterMapping(mapping);
      mappingCount++;

      // Create sample bills for master-metered utilities
      if (meter.meteringMethod === "master") {
        for (const [month, amounts] of Object.entries(BILL_AMOUNTS)) {
          const baseAmount = amounts[meter.meterType] || 300;
          const totalAmount = generateBillAmount(baseAmount, prop.units.length);

          // Create simple allocations based on equal split for seed data
          const share = 1 / prop.units.length;
          const perUnit = Math.round((totalAmount / prop.units.length) * 100) / 100;
          const allocations: RubsAllocation[] = prop.units.map((u, idx) => ({
            unitId: u.id,
            unitName: u.name,
            tenant: `Tenant ${idx + 1}`,
            sqft: 600 + Math.floor(Math.random() * 400),
            occupants: 1,
            share: Math.round(share * 10000) / 10000,
            amount: idx === prop.units.length - 1
              ? Math.round((totalAmount - perUnit * (prop.units.length - 1)) * 100) / 100
              : perUnit,
          }));

          const bill: RubsBill = {
            id: `bill-${prop.name.replace(/\s/g, "-").toLowerCase()}-${meter.meterType}-${month}`,
            propertyName: prop.name,
            month,
            meterType: meter.meterType,
            totalAmount,
            mappingId: mapping.id,
            status: month === "2026-03" ? "draft" : "calculated",
            allocations,
            createdAt: new Date(`${month}-15T12:00:00Z`).toISOString(),
            updatedAt: new Date(`${month}-15T12:00:00Z`).toISOString(),
          };
          saveBill(bill);
          billCount++;
        }
      }
    }
  }

  return { mappings: mappingCount, bills: billCount };
}

export { isSeeded } from "./rubs-db";
