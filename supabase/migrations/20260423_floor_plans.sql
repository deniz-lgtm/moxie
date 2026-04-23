-- Floor Plans Library
-- Pre-loaded floor plans associated with property + unit.
-- Inspections auto-load from this table so inspectors don't need to upload on site.

CREATE TABLE floor_plans (
  id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  property_name TEXT       NOT NULL,
  unit_id      TEXT,
  unit_name    TEXT        NOT NULL,
  label        TEXT        NOT NULL DEFAULT 'Floor Plan',
  storage_url  TEXT        NOT NULL,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_floor_plans_unit_id   ON floor_plans(unit_id);
CREATE INDEX idx_floor_plans_unit_name ON floor_plans(unit_name);

ALTER TABLE floor_plans ENABLE ROW LEVEL SECURITY;
CREATE POLICY "floor_plans_all" ON floor_plans FOR ALL USING (true) WITH CHECK (true);
