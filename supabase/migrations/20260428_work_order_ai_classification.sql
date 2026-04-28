-- ============================================
-- Work Order AI Classification (server-side cache)
-- ============================================
-- Persists Claude's category/priority/title pass on each work order so
-- that classifications survive across browsers and users (no more
-- per-client localStorage). All fields are nullable — null means
-- "not yet classified".

alter table work_order_annotations
  add column if not exists ai_category text,
  add column if not exists ai_priority text,
  add column if not exists ai_title text,
  add column if not exists ai_classified_at timestamptz;

create index if not exists work_order_annotations_ai_classified_at_idx
  on work_order_annotations (ai_classified_at);
