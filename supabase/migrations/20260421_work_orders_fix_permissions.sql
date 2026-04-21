-- ============================================
-- Work Orders Permissions Fix
-- ============================================
-- Run this AFTER 20260421_work_orders.sql and
-- 20260421_work_order_annotations.sql if you see
-- "new row violates row-level security policy for table ...".
--
-- Supabase enforces access via a combination of role grants AND
-- row-level security policies. Our earlier migrations used
-- `disable row level security`, which Supabase silently ignores on
-- hosted projects. The working pattern (same as rubs_fix_permissions
-- in this repo) is to enable RLS and add a permissive "allow all"
-- policy per table. For a small internal team this is equivalent to
-- RLS-off but satisfies PostgREST's permission checks.

grant usage on schema public to anon, authenticated;
grant all on all tables in schema public to anon, authenticated;
grant all on all sequences in schema public to anon, authenticated;

alter table work_orders enable row level security;
drop policy if exists "work_orders_all" on work_orders;
create policy "work_orders_all" on work_orders
  for all to anon, authenticated using (true) with check (true);

alter table work_order_annotations enable row level security;
drop policy if exists "work_order_annotations_all" on work_order_annotations;
create policy "work_order_annotations_all" on work_order_annotations
  for all to anon, authenticated using (true) with check (true);
