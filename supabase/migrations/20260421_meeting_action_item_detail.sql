-- ============================================
-- Meeting action items — detail fields
-- ============================================
-- Adds append-only comment thread and attachment metadata to each action
-- item, plus the storage bucket where attachment blobs live. Attachments
-- are uploaded client-side to the bucket; the jsonb column stores their
-- public URLs + display metadata so the task board can render them
-- without hitting the storage API.

alter table meeting_action_items
  add column if not exists comments jsonb not null default '[]'::jsonb,
  add column if not exists attachments jsonb not null default '[]'::jsonb;

-- ── Storage bucket ──────────────────────────────────────────────
insert into storage.buckets (id, name, public)
values ('meeting-attachments', 'meeting-attachments', true)
on conflict (id) do update set public = excluded.public;

drop policy if exists "meeting_attachments_read"   on storage.objects;
drop policy if exists "meeting_attachments_insert" on storage.objects;
drop policy if exists "meeting_attachments_update" on storage.objects;
drop policy if exists "meeting_attachments_delete" on storage.objects;

create policy "meeting_attachments_read"
  on storage.objects for select
  to anon, authenticated
  using (bucket_id = 'meeting-attachments');

create policy "meeting_attachments_insert"
  on storage.objects for insert
  to anon, authenticated
  with check (bucket_id = 'meeting-attachments');

create policy "meeting_attachments_update"
  on storage.objects for update
  to anon, authenticated
  using (bucket_id = 'meeting-attachments')
  with check (bucket_id = 'meeting-attachments');

create policy "meeting_attachments_delete"
  on storage.objects for delete
  to anon, authenticated
  using (bucket_id = 'meeting-attachments');
