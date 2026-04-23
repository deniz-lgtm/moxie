-- ============================================
-- Showings (open-house scheduling)
-- ============================================
-- Student-housing leasing team publishes open-house slots per property,
-- and prospects sign up for a specific slot via a public URL (public_token).
-- Each slot has a capacity; multiple prospects can register up to that
-- capacity, then the slot is "full". Registrations are stored separately
-- so they can be tracked (attended / no-show) after the fact.

create table if not exists showing_slots (
  id text primary key,
  property_id text,
  property_name text,
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  host_user_id text,                   -- auth.users.id of the leasing manager
  host_name text,                      -- denormalized for easier display
  capacity int not null default 10,
  notes text,                          -- internal notes (not shown publicly)
  public_description text,             -- what prospects see on the sign-up page
  public_token text not null unique,   -- random slug → /s/<token>
  status text not null default 'open', -- open | cancelled | completed
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists showing_slots_starts_at_idx on showing_slots (starts_at);
create index if not exists showing_slots_property_id_idx on showing_slots (property_id);
create index if not exists showing_slots_public_token_idx on showing_slots (public_token);
create index if not exists showing_slots_status_idx on showing_slots (status);

create table if not exists showing_registrations (
  id text primary key,
  slot_id text not null references showing_slots(id) on delete cascade,
  prospect_name text not null,
  prospect_email text,
  prospect_phone text,
  party_size int not null default 1,
  status text not null default 'confirmed', -- confirmed | attended | no_show | cancelled
  notes text,                                -- internal notes on the prospect
  guest_card_id text,                        -- AppFolio guest_card_id linkage (PR C)
  source text,                               -- public | manual | imported
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists showing_registrations_slot_id_idx on showing_registrations (slot_id);
create index if not exists showing_registrations_email_idx on showing_registrations (prospect_email);
create index if not exists showing_registrations_guest_card_idx on showing_registrations (guest_card_id);

alter table showing_slots enable row level security;
drop policy if exists "showing_slots_all" on showing_slots;
create policy "showing_slots_all" on showing_slots
  for all to anon, authenticated using (true) with check (true);

alter table showing_registrations enable row level security;
drop policy if exists "showing_registrations_all" on showing_registrations;
create policy "showing_registrations_all" on showing_registrations
  for all to anon, authenticated using (true) with check (true);

grant all on showing_slots to anon, authenticated;
grant all on showing_registrations to anon, authenticated;

drop trigger if exists showing_slots_touch on showing_slots;
create trigger showing_slots_touch
  before update on showing_slots
  for each row execute function rubs_touch_updated_at();

drop trigger if exists showing_registrations_touch on showing_registrations;
create trigger showing_registrations_touch
  before update on showing_registrations
  for each row execute function rubs_touch_updated_at();
