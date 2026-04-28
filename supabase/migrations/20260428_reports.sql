-- ============================================
-- Monthly Reports (moved from localStorage → Supabase)
-- ============================================
-- /reports generates and tracks monthly P&L, occupancy, rent roll, and
-- maintenance-cost reports. These are deliverables to owners — losing
-- them to a cleared browser would erase generated artifacts and their
-- review/sent status. Single table because the variant-shaped data
-- payload fits naturally as jsonb.

create table if not exists reports (
  id text primary key,
  property_id text,
  property_name text not null default '',
  type text not null,                       -- pnl | occupancy | maintenance_cost | rent_roll
  month text not null,                      -- YYYY-MM
  status text not null default 'draft',     -- draft | generated | reviewed | sent
  notes text not null default '',
  data jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists reports_property_id_idx on reports (property_id);
create index if not exists reports_type_idx on reports (type);
create index if not exists reports_month_idx on reports (month);
create index if not exists reports_status_idx on reports (status);

alter table reports enable row level security;
drop policy if exists "reports_all" on reports;
create policy "reports_all" on reports
  for all to anon, authenticated using (true) with check (true);

grant all on reports to anon, authenticated;

drop trigger if exists reports_touch on reports;
create trigger reports_touch
  before update on reports
  for each row execute function rubs_touch_updated_at();
