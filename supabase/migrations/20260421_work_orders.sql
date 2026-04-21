-- ============================================
-- Work Orders (AppFolio snapshot)
-- ============================================
-- Snapshot of AppFolio's `work_order` report, filtered to the Moxie
-- portfolio. Populated by POST /api/maintenance/sync and read by
-- GET /api/maintenance/requests. The `raw` JSONB column holds the
-- original AppFolio payload so future fields can be surfaced without
-- a migration.

create table if not exists work_orders (
  id text primary key,                          -- AppFolio work_order_id (or work_order_number fallback)
  work_order_number text,
  service_request_number text,
  property_id text,
  property_name text,
  unit_id text,
  unit_name text,
  primary_tenant text,
  primary_tenant_email text,
  primary_tenant_phone_number text,
  work_order_type text,
  priority text,
  status text,
  job_description text,
  service_request_description text,
  instructions text,
  vendor text,
  vendor_id text,
  assigned_user text,
  estimate_amount numeric,
  amount numeric,
  scheduled_start date,
  scheduled_end date,
  completed_on date,
  work_completed_on date,
  appfolio_created_at timestamptz,
  status_notes text,
  raw jsonb not null default '{}'::jsonb,
  synced_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists work_orders_property_id_idx on work_orders (property_id);
create index if not exists work_orders_unit_id_idx on work_orders (unit_id);
create index if not exists work_orders_status_idx on work_orders (status);
create index if not exists work_orders_appfolio_created_at_idx on work_orders (appfolio_created_at);
create index if not exists work_orders_synced_at_idx on work_orders (synced_at);

alter table work_orders disable row level security;

grant all on work_orders to anon, authenticated;

-- Reuse the existing `rubs_touch_updated_at` trigger function — it's generic.
drop trigger if exists work_orders_touch on work_orders;
create trigger work_orders_touch
  before update on work_orders
  for each row execute function rubs_touch_updated_at();
