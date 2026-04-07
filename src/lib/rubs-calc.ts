// ============================================
// RUBS Calculation Engine
// ============================================
// Splits a utility bill across units using various methods.
// Handles penny rounding so allocations always sum to the bill total.

import type { MeterMapping, RubsAllocation, SplitMethod } from "./rubs-types";
import type { Unit } from "./types";

interface CalcInput {
  totalAmount: number;
  mapping: MeterMapping;
  units: Unit[];
  splitMethod?: SplitMethod; // override mapping's default
}

export function calculateAllocations(input: CalcInput): RubsAllocation[] {
  const { totalAmount, mapping, units, splitMethod } = input;
  const method = splitMethod || mapping.splitMethod;

  // Filter to units assigned to this meter
  const assignedUnits = units.filter((u) => mapping.unitIds.includes(u.id));
  if (assignedUnits.length === 0) return [];

  // Calculate raw shares based on method
  let rawShares: { unit: Unit; share: number }[];

  switch (method) {
    case "sqft": {
      const totalSqft = assignedUnits.reduce((sum, u) => sum + (u.sqft || 0), 0);
      rawShares = assignedUnits.map((u) => ({
        unit: u,
        share: totalSqft > 0 ? (u.sqft || 0) / totalSqft : 1 / assignedUnits.length,
      }));
      break;
    }
    case "occupancy": {
      // Count real tenants per unit: primary tenant + comma-separated additionalTenants.
      // Vacant units (no tenant) get 0 share.
      const occupants = assignedUnits.map((u) => ({ unit: u, count: countOccupants(u) }));
      const totalOccupants = occupants.reduce((sum, o) => sum + o.count, 0);
      if (totalOccupants > 0) {
        rawShares = occupants.map((o) => ({
          unit: o.unit,
          share: o.count / totalOccupants,
        }));
      } else {
        // All units vacant — fall back to equal split so the bill still gets allocated
        rawShares = assignedUnits.map((u) => ({
          unit: u,
          share: 1 / assignedUnits.length,
        }));
      }
      break;
    }
    case "custom": {
      const customShares = mapping.customShares || {};
      const totalPct = Object.values(customShares).reduce((s, v) => s + v, 0);
      rawShares = assignedUnits.map((u) => ({
        unit: u,
        share: totalPct > 0 ? (customShares[u.id] || 0) / totalPct : 1 / assignedUnits.length,
      }));
      break;
    }
    case "equal":
    default: {
      rawShares = assignedUnits.map((u) => ({
        unit: u,
        share: 1 / assignedUnits.length,
      }));
      break;
    }
  }

  // Convert shares to dollar amounts with penny rounding
  return applyPennyRounding(rawShares, totalAmount);
}

function applyPennyRounding(
  rawShares: { unit: Unit; share: number }[],
  totalAmount: number
): RubsAllocation[] {
  const totalCents = Math.round(totalAmount * 100);

  // Calculate raw cent amounts
  const rawCents = rawShares.map((s) => ({
    ...s,
    cents: s.share * totalCents,
    floorCents: Math.floor(s.share * totalCents),
  }));

  // Distribute remainder cents to units with largest fractional parts
  const allocatedCents = rawCents.reduce((sum, r) => sum + r.floorCents, 0);
  let remainder = totalCents - allocatedCents;

  // Sort by fractional part descending to distribute remainder fairly
  const sorted = rawCents
    .map((r, i) => ({ idx: i, frac: r.cents - r.floorCents }))
    .sort((a, b) => b.frac - a.frac);

  const finalCents = rawCents.map((r) => r.floorCents);
  for (const s of sorted) {
    if (remainder <= 0) break;
    finalCents[s.idx] += 1;
    remainder -= 1;
  }

  return rawCents.map((r, i) => ({
    unitId: r.unit.id,
    unitName: r.unit.unitName || r.unit.number,
    tenant: r.unit.tenant || "Vacant",
    sqft: r.unit.sqft || 0,
    occupants: countOccupants(r.unit),
    share: Math.round(r.share * 10000) / 10000,
    amount: finalCents[i] / 100,
  }));
}

// ─── Tenant Counting ───────────────────────────────────────────

/**
 * Count the actual number of tenants on a unit:
 * primary tenant + comma-separated additionalTenants.
 * Returns 0 for vacant units.
 */
function countOccupants(unit: Unit): number {
  const primary = unit.tenant && unit.tenant.toLowerCase() !== "vacant" ? 1 : 0;
  if (!primary) return 0;
  const additional = unit.additionalTenants
    ? unit.additionalTenants.split(",").map((s) => s.trim()).filter(Boolean).length
    : 0;
  return primary + additional;
}
