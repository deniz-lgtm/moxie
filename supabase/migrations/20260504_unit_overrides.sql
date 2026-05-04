-- ============================================
-- Unit Overrides (Moxie-side per-AppFolio-unit facts)
-- ============================================
-- AppFolio is the source of truth for unit data, but the team needs to
-- patch some fields locally — display names that are wrong in AppFolio,
-- internal notes, and arbitrary per-unit custom fields the team wants
-- to track ("furnished?", "parking spot #", etc.) without an AppFolio
-- migration.
--
-- Keyed by the AppFolio unit_id so the /leasing/units table can join
-- 1:1 with the live unit list. If an override row is missing for a
-- given unit, the AppFolio values render verbatim.

create table if not exists unit_overrides (
  appfolio_unit_id text primary key,
  display_name text,
  notes text,
  custom_fields jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Permissive RLS (same pattern as the rest of the Moxie tables).
alter table unit_overrides enable row level security;
drop policy if exists "unit_overrides_all" on unit_overrides;
create policy "unit_overrides_all" on unit_overrides
  for all to anon, authenticated using (true) with check (true);

grant all on unit_overrides to anon, authenticated;

drop trigger if exists unit_overrides_touch on unit_overrides;
create trigger unit_overrides_touch
  before update on unit_overrides
  for each row execute function rubs_touch_updated_at();
