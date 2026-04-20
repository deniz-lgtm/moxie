-- ============================================
-- RUBS (Ratio Utility Billing System) Tables
-- ============================================
-- Run this SQL in your Supabase project (SQL Editor) to create the
-- persistence layer for RUBS. Until this is run, the app falls back
-- to localStorage (per-browser, non-shared).

-- ─── Meter Mappings ─────────────────────────────────────────────

create table if not exists rubs_meter_mappings (
  id text primary key,
  property_name text not null,
  meter_type text not null,
  metering_method text not null,
  meter_id text not null,
  unit_ids jsonb not null default '[]'::jsonb,
  split_method text not null,
  custom_shares jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists rubs_meter_mappings_property_idx on rubs_meter_mappings (property_name);
create index if not exists rubs_meter_mappings_meter_type_idx on rubs_meter_mappings (meter_type);

-- ─── Bills ──────────────────────────────────────────────────────

create table if not exists rubs_bills (
  id text primary key,
  property_name text not null,
  month text not null,                         -- YYYY-MM
  meter_type text not null,
  total_amount numeric not null,
  mapping_id text not null,
  status text not null,                        -- draft | calculated | posted
  allocations jsonb not null default '[]'::jsonb,
  source_file text,                            -- relative path in bills folder
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists rubs_bills_month_idx on rubs_bills (month);
create index if not exists rubs_bills_property_idx on rubs_bills (property_name);
create index if not exists rubs_bills_status_idx on rubs_bills (status);

-- ─── AppFolio Occupancy Data (singleton) ────────────────────────
-- We only store the most recent template upload. Use a singleton row.

create table if not exists rubs_occupancy (
  id text primary key default 'singleton',
  records jsonb not null default '[]'::jsonb,
  imported_at timestamptz not null default now(),
  filename text not null default '',
  -- enforce singleton
  constraint rubs_occupancy_singleton check (id = 'singleton')
);

-- ─── Property Aliases ───────────────────────────────────────────

create table if not exists rubs_property_aliases (
  id text primary key,
  canonical_name text not null,
  aliases jsonb not null default '[]'::jsonb,
  notes text,
  created_at timestamptz not null default now()
);

create index if not exists rubs_property_aliases_canonical_idx on rubs_property_aliases (canonical_name);

-- ─── Row-level Security ────────────────────────────────────────
-- For now RLS is disabled so the anon key can read/write. Tighten
-- later if multi-tenant isolation is needed.

alter table rubs_meter_mappings disable row level security;
alter table rubs_bills disable row level security;
alter table rubs_occupancy disable row level security;
alter table rubs_property_aliases disable row level security;

-- ─── Grants ─────────────────────────────────────────────────────
-- Allow anon + authenticated roles to use these tables.

grant all on rubs_meter_mappings to anon, authenticated;
grant all on rubs_bills to anon, authenticated;
grant all on rubs_occupancy to anon, authenticated;
grant all on rubs_property_aliases to anon, authenticated;

-- ─── Auto-update updated_at ─────────────────────────────────────

create or replace function rubs_touch_updated_at() returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists rubs_meter_mappings_touch on rubs_meter_mappings;
create trigger rubs_meter_mappings_touch
  before update on rubs_meter_mappings
  for each row execute function rubs_touch_updated_at();

drop trigger if exists rubs_bills_touch on rubs_bills;
create trigger rubs_bills_touch
  before update on rubs_bills
  for each row execute function rubs_touch_updated_at();
