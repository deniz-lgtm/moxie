-- ============================================
-- Comp Watch (moved from localStorage → Supabase)
-- ============================================
-- /comp-watch tracks competitor rents near our properties: rent rates,
-- concessions, occupancy, and a rent-history timeline used to derive
-- the trend indicator. This is hand-curated competitive intel — losing
-- it to a cleared browser would erase a meaningful research investment.
-- Two tables to mirror the slot/registration split used elsewhere:
--   comp_properties     — competitor metadata + current rents (parent)
--   comp_rent_history   — append-only snapshots, FK to comp_properties

create table if not exists comp_properties (
  id text primary key,
  name text not null,
  address text not null default '',
  distance text not null default '',
  avg_rent_1bed numeric,
  avg_rent_2bed numeric,
  avg_rent_4bed numeric,
  concessions text not null default '',
  occupancy text not null default '',
  last_updated date not null default current_date,
  trend text not null default 'stable',  -- up | down | stable
  notes text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists comp_properties_name_idx on comp_properties (name);

create table if not exists comp_rent_history (
  id bigserial primary key,
  comp_id text not null references comp_properties(id) on delete cascade,
  recorded_on date not null,
  avg_rent_1bed numeric,
  avg_rent_2bed numeric,
  avg_rent_4bed numeric,
  created_at timestamptz not null default now(),
  -- One snapshot per (comp, date) — same-day re-edits update in place,
  -- matching the existing client behavior.
  unique (comp_id, recorded_on)
);

create index if not exists comp_rent_history_comp_id_idx on comp_rent_history (comp_id);
create index if not exists comp_rent_history_recorded_on_idx on comp_rent_history (recorded_on);

alter table comp_properties enable row level security;
alter table comp_rent_history enable row level security;

drop policy if exists "comp_properties_all" on comp_properties;
create policy "comp_properties_all" on comp_properties
  for all to anon, authenticated using (true) with check (true);

drop policy if exists "comp_rent_history_all" on comp_rent_history;
create policy "comp_rent_history_all" on comp_rent_history
  for all to anon, authenticated using (true) with check (true);

grant all on comp_properties to anon, authenticated;
grant all on comp_rent_history to anon, authenticated;
grant usage, select on sequence comp_rent_history_id_seq to anon, authenticated;

drop trigger if exists comp_properties_touch on comp_properties;
create trigger comp_properties_touch
  before update on comp_properties
  for each row execute function rubs_touch_updated_at();
