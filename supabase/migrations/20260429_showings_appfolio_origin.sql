-- ============================================
-- Showings: AppFolio origin linkage
-- ============================================
-- When a Moxie open-house slot is "promoted" from a 1-on-1 AppFolio
-- showing, we stamp the AppFolio showing_id and guest_card_id on the
-- Moxie row. This lets us:
--   1. De-dupe the AppFolio shadow on the showings page (don't show
--      both the shadow and the Moxie slot for the same showing).
--   2. Re-derive the original prospect from the AppFolio feed at
--      render time without copying their PII into Moxie.

ALTER TABLE showing_slots
  ADD COLUMN IF NOT EXISTS appfolio_showing_id    TEXT,
  ADD COLUMN IF NOT EXISTS appfolio_guest_card_id TEXT;

CREATE INDEX IF NOT EXISTS showing_slots_appfolio_showing_id_idx
  ON showing_slots (appfolio_showing_id);
