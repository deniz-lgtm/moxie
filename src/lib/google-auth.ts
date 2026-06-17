// Shared Google service-account credentials for GA4 + Search Console.
// The JSON is stored verbatim (single-line) in GOOGLE_SERVICE_ACCOUNT_JSON.

type ServiceAccount = {
  client_email: string;
  private_key: string;
  project_id: string;
};

let cached: ServiceAccount | null | undefined;

export function getServiceAccount(): ServiceAccount | null {
  if (cached !== undefined) return cached;
  const raw = process.env.GOOGLE_SERVICE_ACCOUNT_JSON;
  if (!raw) {
    cached = null;
    return null;
  }
  const parsed = JSON.parse(raw) as ServiceAccount;
  // Newlines in env vars get escaped; restore them for the PEM key.
  parsed.private_key = parsed.private_key.replace(/\\n/g, "\n");
  cached = parsed;
  return parsed;
}
