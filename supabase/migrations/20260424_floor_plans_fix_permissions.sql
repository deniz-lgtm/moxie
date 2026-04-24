-- ============================================
-- Floor Plans Permissions Fix
-- ============================================
-- Run this AFTER 20260423_floor_plans.sql if you see
-- "permission denied for table floor_plans".
--
-- Same pattern as work_orders_fix_permissions and
-- meetings_fix_permissions: enable RLS, grant the anon/authenticated
-- roles, and add a permissive "allow all" policy bound to those roles.

grant usage on schema public to anon, authenticated;
grant all on all tables in schema public to anon, authenticated;
grant all on all sequences in schema public to anon, authenticated;

alter table floor_plans enable row level security;
drop policy if exists "floor_plans_all" on floor_plans;
create policy "floor_plans_all" on floor_plans
  for all to anon, authenticated using (true) with check (true);
