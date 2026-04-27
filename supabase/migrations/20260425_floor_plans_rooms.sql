-- Floor Plans: rooms column
-- Persist the AI-detected (and PM-edited) room list per floor plan so
-- inspections can load pre-numbered rooms instead of running detection
-- every time the unit is walked.

alter table floor_plans
  add column if not exists rooms jsonb not null default '[]'::jsonb;
