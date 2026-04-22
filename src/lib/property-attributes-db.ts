// ============================================
// Property Attributes DB — Moxie overlay per AppFolio property
// ============================================
// Stores insurance + tax facts Moxie wants tracked per property but
// that AppFolio doesn't surface through the reports API. Keyed by
// AppFolio property_id so /portfolio can join 1:1.

import { getSupabase, type DbPropertyAttribute } from "./supabase";
import type { PropertyAttribute } from "./types";

function dbToAttr(row: DbPropertyAttribute): PropertyAttribute {
  return {
    propertyId: row.property_id,
    insuranceCarrier: row.insurance_carrier ?? undefined,
    insurancePolicyNumber: row.insurance_policy_number ?? undefined,
    insuranceExpires: row.insurance_expires ?? undefined,
    insurancePremiumAnnual:
      row.insurance_premium_annual != null ? Number(row.insurance_premium_annual) : undefined,
    taxApn: row.tax_apn ?? undefined,
    taxAnnualAmount: row.tax_annual_amount != null ? Number(row.tax_annual_amount) : undefined,
    taxNextInstallmentDue: row.tax_next_installment_due ?? undefined,
    taxYtdPaid: row.tax_ytd_paid != null ? Number(row.tax_ytd_paid) : undefined,
    notes: row.notes ?? undefined,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function attrToDb(a: PropertyAttribute): Omit<DbPropertyAttribute, "created_at" | "updated_at"> {
  return {
    property_id: a.propertyId,
    insurance_carrier: a.insuranceCarrier ?? null,
    insurance_policy_number: a.insurancePolicyNumber ?? null,
    insurance_expires: a.insuranceExpires ?? null,
    insurance_premium_annual: a.insurancePremiumAnnual ?? null,
    tax_apn: a.taxApn ?? null,
    tax_annual_amount: a.taxAnnualAmount ?? null,
    tax_next_installment_due: a.taxNextInstallmentDue ?? null,
    tax_ytd_paid: a.taxYtdPaid ?? null,
    notes: a.notes ?? null,
  };
}

function isMissingTableError(error: { code?: string; message?: string } | null | undefined): boolean {
  if (!error) return false;
  if (error.code === "42P01") return true;
  if (error.code === "PGRST205") return true;
  return /does not exist|not found in schema|relation .* does not exist/i.test(error.message || "");
}

export async function listPropertyAttributes(): Promise<PropertyAttribute[]> {
  const sb = getSupabase();
  if (!sb) return [];
  const { data, error } = await sb.from("property_attributes").select("*");
  if (error) {
    if (!isMissingTableError(error)) console.warn("[property-attributes-db] list:", error.message);
    return [];
  }
  return (data ?? []).map(dbToAttr);
}

export async function getPropertyAttribute(propertyId: string): Promise<PropertyAttribute | null> {
  const sb = getSupabase();
  if (!sb) return null;
  const { data, error } = await sb
    .from("property_attributes")
    .select("*")
    .eq("property_id", propertyId)
    .maybeSingle();
  if (error) {
    if (!isMissingTableError(error)) console.warn("[property-attributes-db] get:", error.message);
    return null;
  }
  return data ? dbToAttr(data as DbPropertyAttribute) : null;
}

export async function upsertPropertyAttribute(a: PropertyAttribute): Promise<PropertyAttribute> {
  const sb = getSupabase();
  if (!sb) throw new Error("Supabase not configured");
  const { data, error } = await sb
    .from("property_attributes")
    .upsert(attrToDb(a), { onConflict: "property_id" })
    .select("*")
    .single();
  if (error) throw new Error(`[property-attributes-db] upsert: ${error.message}`);
  return dbToAttr(data as DbPropertyAttribute);
}
