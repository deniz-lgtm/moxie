-- ============================================
-- Work Order Annotations (Moxie-side overlay)
-- ============================================
-- Kept in a separate table from `work_orders` so AppFolio syncs don't
-- clobber Moxie-side edits. Joined by id (= AppFolio work_order_id).
-- Every override field is nullable — null means "no override, use the
-- AppFolio value from the work_orders row". Notes are append-only,
-- stored as an array of { text, created_at, author? } objects.

create table if not exists work_order_annotations (
  id text primary key,                          -- = work_orders.id
  notes jsonb not null default '[]'::jsonb,     -- [{ text, created_at, author? }]
  internal_status text,                         -- override of AppFolio status
  assigned_to_override text,
  vendor_override text,
  scheduled_date_override date,
  tags jsonb not null default '[]'::jsonb,      -- string[]
  follow_up_on date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists work_order_annotations_follow_up_idx on work_order_annotations (follow_up_on);
create index if not exists work_order_annotations_updated_at_idx on work_order_annotations (updated_at);

alter table work_order_annotations disable row level security;

grant all on work_order_annotations to anon, authenticated;

drop trigger if exists work_order_annotations_touch on work_order_annotations;
create trigger work_order_annotations_touch
  before update on work_order_annotations
  for each row execute function rubs_touch_updated_at();
