-- ============================================
-- RUBS: Supabase Storage bucket for bill PDFs
-- ============================================
-- Replaces the ngrok/Windows downloader setup. PDFs are uploaded directly
-- from the browser into this bucket and read back from the web app. Safe to
-- run more than once.

insert into storage.buckets (id, name, public)
values ('rubs-bills', 'rubs-bills', true)
on conflict (id) do update set public = excluded.public;

-- Allow anon + authenticated to read/write (small internal team; same
-- trust model as the other RUBS tables).

drop policy if exists "rubs_bills_storage_read"   on storage.objects;
drop policy if exists "rubs_bills_storage_insert" on storage.objects;
drop policy if exists "rubs_bills_storage_update" on storage.objects;
drop policy if exists "rubs_bills_storage_delete" on storage.objects;

create policy "rubs_bills_storage_read"
  on storage.objects for select
  to anon, authenticated
  using (bucket_id = 'rubs-bills');

create policy "rubs_bills_storage_insert"
  on storage.objects for insert
  to anon, authenticated
  with check (bucket_id = 'rubs-bills');

create policy "rubs_bills_storage_update"
  on storage.objects for update
  to anon, authenticated
  using (bucket_id = 'rubs-bills')
  with check (bucket_id = 'rubs-bills');

create policy "rubs_bills_storage_delete"
  on storage.objects for delete
  to anon, authenticated
  using (bucket_id = 'rubs-bills');
