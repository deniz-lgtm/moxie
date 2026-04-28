-- ============================================
-- Tenant Notices (moved from localStorage → Supabase)
-- ============================================
-- The /notices page was keeping notice records (lease violations,
-- rent reminders, lease renewal letters, building announcements) in
-- the user's browser localStorage. These are legal/compliance
-- artifacts — we need a real audit trail (sent_at, delivered_at,
-- acknowledged_at) and team-wide visibility.

create table if not exists notices (
  id text primary key,
  type text not null,                       -- violation | rent_reminder | building_announcement | lease_renewal | maintenance_notice
  status text not null default 'draft',     -- draft | sent | delivered | acknowledged
  subject text not null,
  body text not null default '',
  recipient_type text not null default 'individual',  -- individual | all
  property_id text,
  unit_id text,
  unit_name text not null default '',
  tenant_name text not null default '',
  delivery_method text not null default 'email',      -- email | sms | portal | mail
  sent_at timestamptz,
  delivered_at timestamptz,
  acknowledged_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists notices_property_id_idx on notices (property_id);
create index if not exists notices_unit_id_idx on notices (unit_id);
create index if not exists notices_status_idx on notices (status);
create index if not exists notices_type_idx on notices (type);
create index if not exists notices_created_at_idx on notices (created_at desc);

alter table notices enable row level security;
drop policy if exists "notices_all" on notices;
create policy "notices_all" on notices
  for all to anon, authenticated using (true) with check (true);

grant all on notices to anon, authenticated;

drop trigger if exists notices_touch on notices;
create trigger notices_touch
  before update on notices
  for each row execute function rubs_touch_updated_at();
