// ============================================
// Dropbox Sign (formerly HelloSign) API Integration
// ============================================
// REST API at https://api.hellosign.com/v3 — auth: HTTP Basic with the API
// key as the username (no password). Templates are uploaded once via the
// dashboard; we send signature requests against the template_id with a
// `custom_fields` map filling its merge fields.
//
// Required env:
//   HELLOSIGN_API_KEY         API key from Dropbox Sign → Settings → API
//   HELLOSIGN_TEST_MODE       optional "1"/"true" — uses test_mode=1 on
//                             every send so signatures aren't billable.
//
// Per-template env (one var per registered template):
//   HELLOSIGN_TEMPLATE_<KEY>  the template_id

import crypto from "crypto";

const BASE_URL = "https://api.hellosign.com/v3";

function requireApiKey(): string {
  const key = process.env.HELLOSIGN_API_KEY;
  if (!key) {
    throw new Error(
      "Dropbox Sign not configured. Set HELLOSIGN_API_KEY (and the per-template id env vars)."
    );
  }
  return key;
}

function authHeader(): string {
  // Basic auth: base64("<api_key>:") — empty password is significant.
  const encoded = Buffer.from(`${requireApiKey()}:`).toString("base64");
  return `Basic ${encoded}`;
}

function isTestMode(): boolean {
  const v = process.env.HELLOSIGN_TEST_MODE;
  return v === "1" || v?.toLowerCase() === "true";
}

// --- Send a signature request from a template ---

export interface SendFromTemplateInput {
  templateId: string;
  signerName: string;
  signerEmail: string;
  /** Map of merge-field name → string value (must match the template's field names exactly). */
  customFields?: Record<string, string>;
  /** Free-form metadata passed back on every webhook event. Use this to
   *  correlate Dropbox's signature_request_id with our signing_requests.id. */
  metadata?: Record<string, string>;
  subject?: string;
  message?: string;
}

export interface SignatureRequestResult {
  signature_request_id: string;
  is_complete: boolean;
  is_declined: boolean;
  signing_url?: string;
  signers?: Array<{
    signer_email_address: string;
    signer_name: string;
    signature_id: string;
    status_code: string;
  }>;
  [key: string]: unknown;
}

export async function sendFromTemplate(
  input: SendFromTemplateInput
): Promise<SignatureRequestResult> {
  // The endpoint accepts application/x-www-form-urlencoded with array-style
  // keys for nested fields (e.g. signers[0][email_address]). JSON works too
  // if the request body is a JSON object — we'll use form-encoded since
  // it's how the Dropbox Sign reference docs everything.
  const body = new URLSearchParams();
  body.set("template_id", input.templateId);
  body.set("test_mode", isTestMode() ? "1" : "0");
  body.set("signers[0][role]", "Signer");
  body.set("signers[0][name]", input.signerName);
  body.set("signers[0][email_address]", input.signerEmail);
  if (input.subject) body.set("subject", input.subject);
  if (input.message) body.set("message", input.message);
  for (const [k, v] of Object.entries(input.customFields ?? {})) {
    body.set(`custom_fields[${k}]`, v);
  }
  for (const [k, v] of Object.entries(input.metadata ?? {})) {
    body.set(`metadata[${k}]`, v);
  }

  const res = await fetch(`${BASE_URL}/signature_request/send_with_template`, {
    method: "POST",
    headers: {
      Authorization: authHeader(),
      "Content-Type": "application/x-www-form-urlencoded",
      Accept: "application/json",
    },
    body: body.toString(),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Dropbox Sign send error ${res.status}: ${text.slice(0, 400)}`);
  }
  const json = (await res.json()) as { signature_request: SignatureRequestResult };
  return json.signature_request;
}

// --- Download the final signed PDF ---

export async function downloadSignedFile(
  signatureRequestId: string
): Promise<Buffer> {
  const url = `${BASE_URL}/signature_request/files/${encodeURIComponent(
    signatureRequestId
  )}?file_type=pdf`;
  const res = await fetch(url, {
    headers: { Authorization: authHeader() },
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Dropbox Sign download error ${res.status}: ${text.slice(0, 400)}`);
  }
  const arrayBuf = await res.arrayBuffer();
  return Buffer.from(arrayBuf);
}

// --- Webhook signature verification ---
// Dropbox Sign signs every webhook by computing
//   HMAC-SHA256(api_key, event_time + event_type)
// and putting it in event.event_hash. We re-compute and compare in
// constant time. The api_key is the HMAC secret (NOT a separate webhook
// secret) — yes, that's their design.

export function verifyWebhookEvent(payload: {
  event_time: string;
  event_type: string;
  event_hash: string;
}): boolean {
  const apiKey = process.env.HELLOSIGN_API_KEY;
  if (!apiKey || !payload?.event_hash) return false;
  const expected = crypto
    .createHmac("sha256", apiKey)
    .update(`${payload.event_time}${payload.event_type}`)
    .digest("hex");
  try {
    return crypto.timingSafeEqual(
      Buffer.from(expected, "hex"),
      Buffer.from(payload.event_hash, "hex")
    );
  } catch {
    return false;
  }
}
