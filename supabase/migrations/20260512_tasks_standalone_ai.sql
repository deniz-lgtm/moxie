-- ============================================
-- Tasks: standalone tasks + AI next-step suggestion cache
-- ============================================
-- 1. Make meeting_id / property_id nullable on meeting_action_items so
--    tasks can be added directly from the Tasks page without first
--    creating a meeting. Existing rows aren't affected; the FK to
--    property_meetings is kept (a NULL meeting_id is still valid).
-- 2. Cache the latest AI "suggested next step" per task so the UI
--    doesn't hit the model on every render.

alter table meeting_action_items
  alter column meeting_id drop not null,
  alter column property_id drop not null;

alter table meeting_action_items
  add column if not exists ai_next_step text,
  add column if not exists ai_next_step_at timestamptz;
