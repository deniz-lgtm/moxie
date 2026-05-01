// ============================================
// Signing template registry
// ============================================
// Logical document name → which provider template to use, plus a list of
// the merge fields the template expects. The actual template_id lives in
// an env var so swapping templates per environment (test/prod) doesn't
// require a code change.
//
// To add a new template:
//   1. Upload the PDF to Dropbox Sign as a template, name the merge
//      fields, copy the template_id.
//   2. Set HELLOSIGN_TEMPLATE_<KEY_UPPERCASE> on Railway.
//   3. Add an entry below.
//   4. Add a prefill builder in signing-prefill.ts (or pass `prefill`
//      directly when calling /api/signing/send).

export type TemplateKey =
  | "deposit_refund_instruction";

export interface TemplateDescriptor {
  /** Human-readable label for UI surfaces (Documents page picker, etc.). */
  label: string;
  /** Names of the merge fields the template expects. The send route
   *  validates that the prefill payload doesn't include unknown keys. */
  fields: readonly string[];
  /** Lazily reads the env var holding the provider's template_id so an
   *  unset env doesn't crash module load — only the actual send call. */
  resolveProviderTemplateId: () => string;
}

function envTemplateId(envVar: string): () => string {
  return () => {
    const v = process.env[envVar];
    if (!v) {
      throw new Error(
        `Missing ${envVar}. Upload the template to Dropbox Sign and set the env var.`
      );
    }
    return v;
  };
}

export const SIGNING_TEMPLATES: Record<TemplateKey, TemplateDescriptor> = {
  deposit_refund_instruction: {
    label: "Security Deposit Refund Instruction",
    fields: ["tenant_name", "property_address", "deposit_amount", "today_date"] as const,
    resolveProviderTemplateId: envTemplateId("HELLOSIGN_TEMPLATE_DEPOSIT_REFUND"),
  },
};

export function isTemplateKey(s: string): s is TemplateKey {
  return Object.prototype.hasOwnProperty.call(SIGNING_TEMPLATES, s);
}
