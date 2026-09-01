-- Contacts: free-text role + multi-select departments
--
-- Role was already stored as `text` in the contacts table, but the app
-- restricted input to a fixed enum. The UI is being opened up to allow
-- custom roles, so no schema change is needed for that.
--
-- Departments was a single free-text field; replace it with a structured
-- multi-select backed by a jsonb array. The legacy `department` column
-- is preserved (nullable) so old rows still render until migrated by
-- the user. New writes go to `departments`.

alter table contacts
  add column if not exists departments jsonb not null default '[]'::jsonb;
