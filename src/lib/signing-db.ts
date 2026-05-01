// ============================================
// Signing requests — Supabase CRUD
// ============================================
// One row per outbound signature request. The provider's
// signature_request_id is the natural foreign key for webhook updates,
// but we keep our own UUID-style id so the row exists before the
// upstream send (and we can mark it `error` if the send fails).

import { getSupabase, type DbSigningRequest, type SigningRequestStatus } from "./supabase";
import type { SigningRequest } from "./types";

const SIGNED_PDF_BUCKET = "signed-documents";

function dbToSigningRequest(row: DbSigningRequest): SigningRequest {
  return {
    id: row.id,
    templateKey: row.template_key,
    provider: row.provider,
    providerRequestId: row.provider_request_id ?? undefined,
    status: row.status,
    recipientName: row.recipient_name,
    recipientEmail: row.recipient_email,
    prefill: row.prefill ?? undefined,
    sourceType: row.source_type ?? undefined,
    sourceId: row.source_id ?? undefined,
    propertyId: row.property_id ?? undefined,
    unitId: row.unit_id ?? undefined,
    tenantId: row.tenant_id ?? undefined,
    signedPdfUrl: row.signed_pdf_url ?? undefined,
    signUrl: row.sign_url ?? undefined,
    signedAt: row.signed_at ?? undefined,
    declinedAt: row.declined_at ?? undefined,
    lastEventAt: row.last_event_at ?? undefined,
    errorMessage: row.error_message ?? undefined,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function signingRequestToDb(
  r: SigningRequest
): Omit<DbSigningRequest, "created_at" | "updated_at"> {
  return {
    id: r.id,
    template_key: r.templateKey,
    provider: r.provider,
    provider_request_id: r.providerRequestId ?? null,
    status: r.status,
    recipient_name: r.recipientName,
    recipient_email: r.recipientEmail,
    prefill: r.prefill ?? null,
    source_type: r.sourceType ?? null,
    source_id: r.sourceId ?? null,
    property_id: r.propertyId ?? null,
    unit_id: r.unitId ?? null,
    tenant_id: r.tenantId ?? null,
    signed_pdf_url: r.signedPdfUrl ?? null,
    sign_url: r.signUrl ?? null,
    signed_at: r.signedAt ?? null,
    declined_at: r.declinedAt ?? null,
    last_event_at: r.lastEventAt ?? null,
    error_message: r.errorMessage ?? null,
  };
}

export function makeSigningRequestId(): string {
  return `sr_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
}

export async function insertSigningRequest(
  r: SigningRequest
): Promise<SigningRequest> {
  const sb = getSupabase();
  if (!sb) throw new Error("Supabase not configured");
  const { data, error } = await sb
    .from("signing_requests")
    .insert(signingRequestToDb(r))
    .select()
    .single();
  if (error) throw new Error(`[signing-db] insert: ${error.message}`);
  return dbToSigningRequest(data as DbSigningRequest);
}

export async function updateSigningRequest(
  id: string,
  patch: Partial<SigningRequest>
): Promise<SigningRequest> {
  const sb = getSupabase();
  if (!sb) throw new Error("Supabase not configured");
  // Only project the columns we actually changed to keep the update narrow.
  const dbPatch: Partial<DbSigningRequest> = {};
  if (patch.status !== undefined) dbPatch.status = patch.status;
  if (patch.providerRequestId !== undefined) dbPatch.provider_request_id = patch.providerRequestId;
  if (patch.signUrl !== undefined) dbPatch.sign_url = patch.signUrl;
  if (patch.signedPdfUrl !== undefined) dbPatch.signed_pdf_url = patch.signedPdfUrl;
  if (patch.signedAt !== undefined) dbPatch.signed_at = patch.signedAt;
  if (patch.declinedAt !== undefined) dbPatch.declined_at = patch.declinedAt;
  if (patch.lastEventAt !== undefined) dbPatch.last_event_at = patch.lastEventAt;
  if (patch.errorMessage !== undefined) dbPatch.error_message = patch.errorMessage;
  const { data, error } = await sb
    .from("signing_requests")
    .update(dbPatch)
    .eq("id", id)
    .select()
    .single();
  if (error) throw new Error(`[signing-db] update: ${error.message}`);
  return dbToSigningRequest(data as DbSigningRequest);
}

export async function getSigningRequest(id: string): Promise<SigningRequest | null> {
  const sb = getSupabase();
  if (!sb) return null;
  const { data, error } = await sb
    .from("signing_requests")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (error) {
    console.warn("[signing-db] getSigningRequest:", error.message);
    return null;
  }
  return data ? dbToSigningRequest(data as DbSigningRequest) : null;
}

export async function getSigningRequestByProviderId(
  providerRequestId: string
): Promise<SigningRequest | null> {
  const sb = getSupabase();
  if (!sb) return null;
  const { data, error } = await sb
    .from("signing_requests")
    .select("*")
    .eq("provider_request_id", providerRequestId)
    .maybeSingle();
  if (error) {
    console.warn("[signing-db] getByProviderId:", error.message);
    return null;
  }
  return data ? dbToSigningRequest(data as DbSigningRequest) : null;
}

export async function listSigningRequests(opts?: {
  sourceType?: string;
  sourceId?: string;
  status?: SigningRequestStatus;
  recipientEmail?: string;
  limit?: number;
}): Promise<SigningRequest[]> {
  const sb = getSupabase();
  if (!sb) return [];
  let q = sb.from("signing_requests").select("*").order("created_at", { ascending: false });
  if (opts?.sourceType) q = q.eq("source_type", opts.sourceType);
  if (opts?.sourceId) q = q.eq("source_id", opts.sourceId);
  if (opts?.status) q = q.eq("status", opts.status);
  if (opts?.recipientEmail) q = q.eq("recipient_email", opts.recipientEmail);
  if (opts?.limit) q = q.limit(opts.limit);
  const { data, error } = await q;
  if (error) {
    console.warn("[signing-db] list:", error.message);
    return [];
  }
  return (data ?? []).map((r) => dbToSigningRequest(r as DbSigningRequest));
}

/** Upload a signed PDF buffer to the signed-documents bucket. Returns the
 *  public URL of the stored object, or undefined if Supabase isn't
 *  configured (caller can fall back to keeping the upstream link). */
export async function uploadSignedPdf(
  signingRequestId: string,
  buffer: Buffer
): Promise<string | undefined> {
  const sb = getSupabase();
  if (!sb) return undefined;
  const path = `signed/${signingRequestId}.pdf`;
  const { error } = await sb.storage.from(SIGNED_PDF_BUCKET).upload(path, buffer, {
    contentType: "application/pdf",
    upsert: true,
  });
  if (error) {
    console.error("[signing-db] uploadSignedPdf failed:", error.message);
    return undefined;
  }
  const { data } = sb.storage.from(SIGNED_PDF_BUCKET).getPublicUrl(path);
  return data.publicUrl;
}
