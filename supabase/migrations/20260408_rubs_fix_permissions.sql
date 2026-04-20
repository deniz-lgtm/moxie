-- ============================================
-- RUBS Permissions Fix
-- ============================================
-- Run this AFTER 20260408_rubs_tables.sql if you see
-- "permission denied for schema public" (error code 42501).
--
-- Supabase enforces access via a combination of role grants AND
-- row-level security policies. The standard Supabase pattern is to
-- enable RLS and add a permissive policy per role. This matches how
-- the existing `inspections` table in this project is set up.

-- Make sure anon + authenticated can see the schema at all
grant usage on schema public to anon, authenticated;
grant all on all tables in schema public to anon, authenticated;
grant all on all sequences in schema public to anon, authenticated;

-- Enable RLS and add an "allow everything" policy per table.
-- For a small internal team this is equivalent to RLS-off but
-- satisfies Supabase's PostgREST permission checks.

alter table rubs_meter_mappings enable row level security;
drop policy if exists "rubs_meter_mappings_all" on rubs_meter_mappings;
create policy "rubs_meter_mappings_all" on rubs_meter_mappings
  for all to anon, authenticated using (true) with check (true);

alter table rubs_bills enable row level security;
drop policy if exists "rubs_bills_all" on rubs_bills;
create policy "rubs_bills_all" on rubs_bills
  for all to anon, authenticated using (true) with check (true);

alter table rubs_occupancy enable row level security;
drop policy if exists "rubs_occupancy_all" on rubs_occupancy;
create policy "rubs_occupancy_all" on rubs_occupancy
  for all to anon, authenticated using (true) with check (true);

alter table rubs_property_aliases enable row level security;
drop policy if exists "rubs_property_aliases_all" on rubs_property_aliases;
create policy "rubs_property_aliases_all" on rubs_property_aliases
  for all to anon, authenticated using (true) with check (true);
