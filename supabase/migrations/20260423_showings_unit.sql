-- Add unit tracking columns to showing_slots.
-- Shows can be scoped to a specific unit (in addition to a property).
ALTER TABLE showing_slots
  ADD COLUMN IF NOT EXISTS unit_id   TEXT,
  ADD COLUMN IF NOT EXISTS unit_name TEXT;
