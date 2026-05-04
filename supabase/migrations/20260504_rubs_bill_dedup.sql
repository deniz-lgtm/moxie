-- ============================================
-- RUBS bill deduplication + service period
-- ============================================
-- Adds a SHA-256 hash of the source PDF so re-uploads of the same file
-- are caught before they create duplicate bill rows. Also persists the
-- bill's service period so a second-layer semantic dedup can flag bills
-- with the same meter + period + amount even when the PDF bytes differ.

alter table rubs_bills
  add column if not exists file_hash text,
  add column if not exists service_period_start date,
  add column if not exists service_period_end date;

-- Hash is unique across non-null values. Allows existing rows (null hash)
-- to remain and lets a single PDF back exactly one bill.
create unique index if not exists rubs_bills_file_hash_unique
  on rubs_bills (file_hash)
  where file_hash is not null;

-- Helps the semantic dedup query (mapping + period + amount).
create index if not exists rubs_bills_period_idx
  on rubs_bills (mapping_id, service_period_end);
