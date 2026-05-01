-- ============================================
-- Document signing (Dropbox Sign / HelloSign)
-- ============================================
-- One row per outbound signature request. Source-tracked so any feature
-- (move-out inspection, ad-hoc Documents page, future lease addenda)
-- can attach a request to its own primary entity via source_type +
-- source_id. provider_request_id is the unique upstream id from
-- Dropbox Sign and is what webhook events arrive keyed by.

CREATE TABLE IF NOT EXISTS signing_requests (
  id text PRIMARY KEY,
  template_key text NOT NULL,                 -- e.g. "deposit_refund_instruction"
  provider text NOT NULL DEFAULT 'dropbox_sign',
  provider_request_id text UNIQUE,            -- signature_request_id
  status text NOT NULL DEFAULT 'queued',      -- queued|sent|viewed|signed|declined|expired|cancelled|error
  recipient_name text NOT NULL,
  recipient_email text NOT NULL,
  prefill jsonb,
  source_type text,                           -- "move_out_inspection" | "ad_hoc" | …
  source_id text,
  property_id text,
  unit_id text,
  tenant_id text,
  signed_pdf_url text,
  sign_url text,
  signed_at timestamptz,
  declined_at timestamptz,
  last_event_at timestamptz,
  error_message text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS signing_requests_provider_request_id_idx ON signing_requests (provider_request_id);
CREATE INDEX IF NOT EXISTS signing_requests_source_idx ON signing_requests (source_type, source_id);
CREATE INDEX IF NOT EXISTS signing_requests_status_idx ON signing_requests (status);
CREATE INDEX IF NOT EXISTS signing_requests_recipient_email_idx ON signing_requests (recipient_email);

ALTER TABLE signing_requests ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS signing_requests_all ON signing_requests;
CREATE POLICY signing_requests_all ON signing_requests
  FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);
GRANT ALL ON signing_requests TO anon, authenticated;
