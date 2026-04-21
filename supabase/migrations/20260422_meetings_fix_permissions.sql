-- ============================================
-- Meetings Permissions Fix
-- ============================================
-- Run this if you see "new row violates row-level security policy for
-- table property_meetings" (or meeting_action_items).
--
-- Same pattern as work_orders_fix_permissions: `disable row level
-- security` is silently ignored by Supabase's hosted PostgREST stack,
-- so we enable RLS and add a permissive "allow all" policy per table.
-- For a small internal team this is equivalent to RLS-off but satisfies
-- PostgREST's permission checks.

grant usage on schema public to anon, authenticated;
grant all on all tables in schema public to anon, authenticated;
grant all on all sequences in schema public to anon, authenticated;

alter table property_meetings enable row level security;
drop policy if exists "property_meetings_all" on property_meetings;
create policy "property_meetings_all" on property_meetings
  for all to anon, authenticated using (true) with check (true);

alter table meeting_action_items enable row level security;
drop policy if exists "meeting_action_items_all" on meeting_action_items;
create policy "meeting_action_items_all" on meeting_action_items
  for all to anon, authenticated using (true) with check (true);
