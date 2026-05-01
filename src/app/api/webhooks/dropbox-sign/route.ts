import { NextResponse } from "next/server";
import { downloadSignedFile, verifyWebhookEvent } from "@/lib/dropbox-sign";
import {
  getSigningRequest,
  getSigningRequestByProviderId,
  updateSigningRequest,
  uploadSignedPdf,
} from "@/lib/signing-db";

export const dynamic = "force-dynamic";

// Dropbox Sign requires every webhook response to contain the literal
// string "Hello API Event Received" — anywhere in the body or headers —
// or it considers the delivery failed and disables the webhook.
const ACK_BODY = "Hello API Event Received";

interface DropboxSignEvent {
  event_time: string;
  event_type: string;
  event_hash: string;
  event_metadata?: Record<string, string>;
}

interface DropboxSignPayload {
  event: DropboxSignEvent;
  signature_request?: {
    signature_request_id: string;
    is_complete?: boolean;
    is_declined?: boolean;
    metadata?: Record<string, string>;
  };
}

/**
 * POST /api/webhooks/dropbox-sign
 *
 * Dropbox Sign delivers webhook events as multipart/form-data with a
 * single field named `json` whose value is the JSON payload above.
 * (They also support application/json bodies if you select that in the
 * dashboard — we accept both.)
 *
 * Auth = HMAC-SHA256(api_key, event_time + event_type), checked by
 * verifyWebhookEvent. We always return ACK_BODY with HTTP 200 once the
 * payload is parsed — even on internal errors — to avoid the webhook
 * being disabled on the upstream side; failures get logged.
 */
export async function POST(request: Request) {
  let payload: DropboxSignPayload | null = null;
  try {
    const ctype = request.headers.get("content-type") ?? "";
    if (ctype.includes("application/json")) {
      payload = (await request.json()) as DropboxSignPayload;
    } else {
      const form = await request.formData();
      const raw = form.get("json");
      if (typeof raw === "string") {
        payload = JSON.parse(raw) as DropboxSignPayload;
      }
    }
  } catch (err) {
    console.warn("[dropbox-sign] payload parse failed:", err);
  }

  if (!payload?.event) {
    // Dropbox Sign also sends a "callback_test" ping. Always ack.
    return new NextResponse(ACK_BODY, { status: 200 });
  }

  if (!verifyWebhookEvent(payload.event)) {
    console.warn("[dropbox-sign] HMAC verification failed", {
      type: payload.event.event_type,
      time: payload.event.event_time,
    });
    return new NextResponse("Hello API Event Received - signature invalid", { status: 401 });
  }

  try {
    await handleEvent(payload);
  } catch (err: any) {
    console.error("[dropbox-sign] handler error:", err?.message ?? err);
  }

  return new NextResponse(ACK_BODY, { status: 200 });
}

async function handleEvent(payload: DropboxSignPayload) {
  const { event, signature_request } = payload;
  const providerRequestId = signature_request?.signature_request_id;
  if (!providerRequestId) return;

  // Two paths for finding our row:
  //   1. metadata.signing_request_id (set on send) — preferred, survives even
  //      if the upstream id reuses across test mode resets.
  //   2. provider_request_id — fallback when metadata is absent.
  const metaId = signature_request?.metadata?.signing_request_id;
  let row = metaId ? await getSigningRequest(metaId) : null;
  if (!row) row = await getSigningRequestByProviderId(providerRequestId);
  if (!row) {
    console.warn("[dropbox-sign] no matching signing_requests row for", providerRequestId);
    return;
  }

  const now = new Date().toISOString();

  switch (event.event_type) {
    case "signature_request_sent":
      // Dropbox Sign also fires this when WE call send_with_template. The
      // send route already stamps status='sent', so this is just a refresh.
      await updateSigningRequest(row.id, {
        status: row.status === "queued" ? "sent" : row.status,
        providerRequestId,
        lastEventAt: now,
      });
      return;

    case "signature_request_viewed":
      await updateSigningRequest(row.id, {
        // Don't downgrade from signed/declined back to viewed if events
        // arrive out of order.
        status: row.status === "signed" || row.status === "declined" ? row.status : "viewed",
        lastEventAt: now,
      });
      return;

    case "signature_request_signed":
      // Per-signer event — for our single-signer templates the
      // all_signed event is what completes the row.
      await updateSigningRequest(row.id, { lastEventAt: now });
      return;

    case "signature_request_all_signed": {
      // Idempotency: if we already finalised this row, skip the upload +
      // status update. Re-deliveries are common with webhook retries.
      if (row.status === "signed" && row.signedPdfUrl) {
        await updateSigningRequest(row.id, { lastEventAt: now });
        return;
      }
      let signedPdfUrl: string | undefined;
      try {
        const buffer = await downloadSignedFile(providerRequestId);
        signedPdfUrl = await uploadSignedPdf(row.id, buffer);
      } catch (err: any) {
        console.error("[dropbox-sign] signed PDF download/upload failed:", err?.message ?? err);
      }
      await updateSigningRequest(row.id, {
        status: "signed",
        signedAt: now,
        lastEventAt: now,
        signedPdfUrl,
      });
      return;
    }

    case "signature_request_declined":
      await updateSigningRequest(row.id, {
        status: "declined",
        declinedAt: now,
        lastEventAt: now,
      });
      return;

    case "signature_request_canceled":
      await updateSigningRequest(row.id, { status: "cancelled", lastEventAt: now });
      return;

    case "signature_request_expired":
      await updateSigningRequest(row.id, { status: "expired", lastEventAt: now });
      return;

    default:
      // Includes signature_request_email_bounce, signature_request_remind,
      // and a long tail. Stamp last_event_at for visibility in the audit row.
      await updateSigningRequest(row.id, { lastEventAt: now });
      return;
  }
}

// Dropbox Sign occasionally probes the URL with a GET; respond cleanly.
export async function GET() {
  return new NextResponse(ACK_BODY, { status: 200 });
}
