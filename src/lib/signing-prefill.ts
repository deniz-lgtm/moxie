// ============================================
// Signing template prefill builders
// ============================================
// One pure function per registered template that turns the source data
// (a move-out inspection, a tenant + unit pair, etc.) into a string-map
// that matches the template's merge field names exactly.
//
// Keeping these as pure functions means both the client (e.g. the
// move-out wizard) and the server (e.g. an ad-hoc Documents page send)
// can compute the same prefill without duplicating the mapping rules.

import type { Inspection } from "./types";

function todayMmDdYyyy(): string {
  const d = new Date();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${mm}/${dd}/${d.getFullYear()}`;
}

function formatUsd(n: number | null | undefined): string {
  if (n == null || Number.isNaN(n)) return "";
  return n.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });
}

/** Compose a property/unit address string for the form's "Property Address" field.
 *  AppFolio doesn't give us a single-line address per unit; the cleanest rendering
 *  combines the property name (street) and the unit number (apt #) — same shape
 *  the move-out flow already shows on screen. */
function composeAddress(propertyName: string, unitNumber: string): string {
  const p = (propertyName || "").trim();
  const u = (unitNumber || "").trim();
  if (!p && !u) return "";
  if (!u || u === p) return p;
  return `${p} ${u}`.trim();
}

// --- Security Deposit Refund Instruction ---
// Template merge fields (set up these names in the Dropbox Sign template):
//   tenant_name, property_address, deposit_amount, today_date

export interface DepositRefundPrefillInput {
  tenantName: string;
  propertyName: string;
  unitNumber: string;
  depositAmount: number | null;
}

export interface DepositRefundPrefill {
  tenant_name: string;
  property_address: string;
  deposit_amount: string;
  today_date: string;
}

export function buildDepositRefundPrefill(
  input: DepositRefundPrefillInput
): DepositRefundPrefill {
  return {
    tenant_name: input.tenantName.trim(),
    property_address: composeAddress(input.propertyName, input.unitNumber),
    deposit_amount: formatUsd(input.depositAmount),
    today_date: todayMmDdYyyy(),
  };
}

/** Convenience: pull every prefill input straight off a move-out Inspection row. */
export function buildDepositRefundPrefillFromInspection(
  insp: Inspection
): DepositRefundPrefill {
  return buildDepositRefundPrefill({
    tenantName: insp.tenantName ?? "",
    propertyName: insp.propertyName ?? "",
    unitNumber: insp.unitNumber ?? "",
    depositAmount: insp.depositAmount,
  });
}
