-- ============================================
-- Vendors + Contacts
-- ============================================
-- `vendors` is the Moxie-side source of truth; when synced against
-- Notion, each row carries `notion_page_id` and `notion_last_synced_at`
-- so the /api/vendors/sync endpoint can reconcile both sides.
-- `contacts` is a simple internal team directory (no external sync).

create table if not exists vendors (
  id text primary key,
  name text not null,
  category text,
  phone text,
  email text,
  website text,
  address text,
  contact_name text,
  license_number text,
  insurance_expiry date,
  status text,                                  -- active | inactive | preferred
  rating integer,
  notes text,
  is_internal boolean not null default false,
  notion_page_id text unique,
  notion_last_synced_at timestamptz,
  raw jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists vendors_category_idx on vendors (category);
create index if not exists vendors_status_idx on vendors (status);
create index if not exists vendors_notion_page_idx on vendors (notion_page_id);

create table if not exists contacts (
  id text primary key,
  name text not null,
  role text,                                    -- property_manager | maintenance | leasing | asset_mgr | owner_rep | other
  email text,
  phone text,
  department text,
  notes text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists contacts_role_idx on contacts (role);
create index if not exists contacts_is_active_idx on contacts (is_active);

-- RLS (follow the pattern used elsewhere: enable + permissive allow-all policy)
alter table vendors enable row level security;
drop policy if exists "vendors_all" on vendors;
create policy "vendors_all" on vendors
  for all to anon, authenticated using (true) with check (true);

alter table contacts enable row level security;
drop policy if exists "contacts_all" on contacts;
create policy "contacts_all" on contacts
  for all to anon, authenticated using (true) with check (true);

grant usage on schema public to anon, authenticated;
grant all on all tables in schema public to anon, authenticated;
grant all on all sequences in schema public to anon, authenticated;

drop trigger if exists vendors_touch on vendors;
create trigger vendors_touch
  before update on vendors
  for each row execute function rubs_touch_updated_at();

drop trigger if exists contacts_touch on contacts;
create trigger contacts_touch
  before update on contacts
  for each row execute function rubs_touch_updated_at();
