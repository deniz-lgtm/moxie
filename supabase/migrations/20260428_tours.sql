-- ============================================
-- Tour Slots + Tour Registrations (moved from localStorage → Supabase)
-- ============================================
-- The /leasing/tours page kept open-house tour slots and prospect
-- registrations in browser localStorage. Tours drive leasing analytics
-- (TourStats component on the leasing parent page) and need team-wide
-- visibility — one leasing agent shouldn't be the only person who can
-- see tomorrow's open house registrations.
--
-- Two tables to mirror the existing showings-db split:
--   tour_slots          — open-house slots (parent)
--   tour_registrations  — prospect signups (child, cascade delete)

create table if not exists tour_slots (
  id text primary key,
  property_id text,
  property_name text not null default '',
  date date not null,
  start_time text not null,
  end_time text not null,
  host text not null default 'TBD',
  capacity int not null default 10,
  pre_reminder_status text not null default 'not_set',  -- not_set | scheduled | sent
  post_follow_up_status text not null default 'not_set',
  notes text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists tour_slots_property_id_idx on tour_slots (property_id);
create index if not exists tour_slots_date_idx on tour_slots (date);

create table if not exists tour_registrations (
  id text primary key,
  slot_id text not null references tour_slots(id) on delete cascade,
  prospect_name text not null default '',
  prospect_email text not null default '',
  prospect_phone text,
  status text not null default 'pending',  -- pending | confirmed | attended | no_show | rescheduled | cancelled
  registered_at timestamptz not null default now(),
  -- Canonical sources for lead attribution work: 'walk-in' | 'web' | 'chat' | 'showing' | 'apply' | 'other'.
  -- Left as free-text for now to avoid a backfill; tighten to enum once the data is normalized.
  source text,
  notes text,
  follow_up_sent boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists tour_registrations_slot_id_idx on tour_registrations (slot_id);
create index if not exists tour_registrations_status_idx on tour_registrations (status);
create index if not exists tour_registrations_source_idx on tour_registrations (source);

alter table tour_slots enable row level security;
alter table tour_registrations enable row level security;

drop policy if exists "tour_slots_all" on tour_slots;
create policy "tour_slots_all" on tour_slots
  for all to anon, authenticated using (true) with check (true);

drop policy if exists "tour_registrations_all" on tour_registrations;
create policy "tour_registrations_all" on tour_registrations
  for all to anon, authenticated using (true) with check (true);

grant all on tour_slots to anon, authenticated;
grant all on tour_registrations to anon, authenticated;

drop trigger if exists tour_slots_touch on tour_slots;
create trigger tour_slots_touch
  before update on tour_slots
  for each row execute function rubs_touch_updated_at();

drop trigger if exists tour_registrations_touch on tour_registrations;
create trigger tour_registrations_touch
  before update on tour_registrations
  for each row execute function rubs_touch_updated_at();
