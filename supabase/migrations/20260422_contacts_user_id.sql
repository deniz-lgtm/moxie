-- ============================================
-- Contacts: link to auth.users
-- ============================================
-- When a user is added via the /users admin page, we auto-create a
-- matching contact row. user_id stores the Supabase auth user's UUID so
-- we can find and update (or archive) the contact when the user is
-- deleted. Nullable so existing manually-created contacts keep working.

alter table contacts
  add column if not exists user_id text;

create index if not exists contacts_user_id_idx on contacts (user_id);
