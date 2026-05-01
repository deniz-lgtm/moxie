import { NextResponse } from "next/server";
import { sendFromTemplate } from "@/lib/dropbox-sign";
import {
  insertSigningRequest,
  makeSigningRequestId,
  updateSigningRequest,
} from "@/lib/signing-db";
import { isTemplateKey, SIGNING_TEMPLATES } from "@/lib/signing-templates";
import type { SigningRequest } from "@/lib/types";

export const dynamic = "force-dynamic";

/**
 * POST /api/signing/send
 *
 * Send a Dropbox Sign signature request from a registered template.
 *
 * Body: {
 *   templateKey,                    // must be in SIGNING_TEMPLATES
 *   recipientName, recipientEmail,
 *   prefill?,                       // { merge_field_name: "value", ... }
 *   sourceType?, sourceId?,         // e.g. "move_out_inspection" + inspection.id
 *   propertyId?, unitId?, tenantId?,
 *   subject?, message?              // override the default email
 * }
 *
 * Inserts a `signing_requests` row first (status="queued"), then calls
 * Dropbox Sign. On success the row is updated to status="sent" with the
 * provider's signature_request_id; on failure the row is kept with
 * status="error" so it shows up in the Documents page for retry/triage.
 */
export async function POST(request: Request) {
  try {
    const body = await request.json();
    const {
      templateKey,
      recipientName,
      recipientEmail,
      prefill,
      sourceType,
      sourceId,
      propertyId,
      unitId,
      tenantId,
      subject,
      message,
    } = body ?? {};

    if (!templateKey || typeof templateKey !== "string" || !isTemplateKey(templateKey)) {
      return NextResponse.json(
        { error: `Unknown templateKey: ${templateKey}` },
        { status: 400 }
      );
    }
    if (!recipientName?.trim() || !recipientEmail?.trim()) {
      return NextResponse.json(
        { error: "Missing recipientName or recipientEmail" },
        { status: 400 }
      );
    }

    const descriptor = SIGNING_TEMPLATES[templateKey];

    // Drop any prefill keys the template doesn't expect — they'd be silently
    // ignored upstream and just clutter our audit row.
    const cleanPrefill: Record<string, string> = {};
    if (prefill && typeof prefill === "object") {
      for (const k of descriptor.fields) {
        const v = (prefill as Record<string, unknown>)[k];
        if (v != null) cleanPrefill[k] = String(v);
      }
    }

    const id = makeSigningRequestId();
    const initial: SigningRequest = {
      id,
      templateKey,
      provider: "dropbox_sign",
      status: "queued",
      recipientName: String(recipientName).trim(),
      recipientEmail: String(recipientEmail).trim(),
      prefill: cleanPrefill,
      sourceType: sourceType ? String(sourceType) : undefined,
      sourceId: sourceId ? String(sourceId) : undefined,
      propertyId: propertyId ? String(propertyId) : undefined,
      unitId: unitId ? String(unitId) : undefined,
      tenantId: tenantId ? String(tenantId) : undefined,
    };

    let row: SigningRequest;
    try {
      row = await insertSigningRequest(initial);
    } catch (err: any) {
      // DB insert failure means we never even tried to send — surface as 500.
      return NextResponse.json(
        { error: err?.message || "Failed to record request" },
        { status: 500 }
      );
    }

    let providerTemplateId: string;
    try {
      providerTemplateId = descriptor.resolveProviderTemplateId();
    } catch (err: any) {
      await updateSigningRequest(row.id, {
        status: "error",
        errorMessage: err?.message ?? "Template id missing",
      });
      return NextResponse.json(
        { error: err?.message || "Template id missing", request: row },
        { status: 500 }
      );
    }

    try {
      const result = await sendFromTemplate({
        templateId: providerTemplateId,
        signerName: row.recipientName,
        signerEmail: row.recipientEmail,
        customFields: cleanPrefill,
        metadata: { signing_request_id: row.id },
        subject,
        message,
      });
      const updated = await updateSigningRequest(row.id, {
        status: "sent",
        providerRequestId: result.signature_request_id,
        signUrl: result.signing_url,
        lastEventAt: new Date().toISOString(),
      });
      return NextResponse.json({ request: updated });
    } catch (err: any) {
      const updated = await updateSigningRequest(row.id, {
        status: "error",
        errorMessage: String(err?.message ?? err).slice(0, 500),
      });
      return NextResponse.json(
        { error: err?.message ?? "Send failed", request: updated },
        { status: 502 }
      );
    }
  } catch (error: any) {
    return NextResponse.json({ error: error.message || "Failed" }, { status: 500 });
  }
}
