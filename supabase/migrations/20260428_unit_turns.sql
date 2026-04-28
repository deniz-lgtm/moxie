-- ============================================
-- Unit Turns + Turn Tasks (moved from localStorage → Supabase)
-- ============================================
-- /unit-turns is the operational pipeline for move-out → ready-date,
-- with task checklists and budget tracking. Living in localStorage
-- meant the maintenance team and asset manager couldn't see the same
-- in-flight turns. Two tables to mirror parent/child split:
--   unit_turns       — turn metadata + budget rollups
--   unit_turn_tasks  — checklist items, FK + ON DELETE CASCADE

create table if not exists unit_turns (
  id text primary key,
  unit_id text not null,
  property_id text,
  unit_number text not null default '',
  property_name text not null default '',
  move_out_date date,
  target_ready_date date,
  move_in_date date,
  status text not null default 'pending',     -- pending | in_progress | completed
  outgoing_tenant text,
  incoming_tenant text,
  total_budget numeric,
  total_spent numeric not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists unit_turns_unit_id_idx on unit_turns (unit_id);
create index if not exists unit_turns_property_id_idx on unit_turns (property_id);
create index if not exists unit_turns_status_idx on unit_turns (status);

create table if not exists unit_turn_tasks (
  id text primary key,
  turn_id text not null references unit_turns(id) on delete cascade,
  name text not null,
  category text not null default 'cleaning', -- cleaning | paint | repairs | flooring | appliances | final_walk
  status text not null default 'not_started',-- not_started | in_progress | completed | blocked
  assigned_to text,
  vendor text,
  estimated_cost numeric,
  actual_cost numeric,
  notes text not null default '',
  due_date date,
  completed_date date,
  position int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists unit_turn_tasks_turn_id_idx on unit_turn_tasks (turn_id);
create index if not exists unit_turn_tasks_status_idx on unit_turn_tasks (status);

alter table unit_turns enable row level security;
alter table unit_turn_tasks enable row level security;

drop policy if exists "unit_turns_all" on unit_turns;
create policy "unit_turns_all" on unit_turns
  for all to anon, authenticated using (true) with check (true);

drop policy if exists "unit_turn_tasks_all" on unit_turn_tasks;
create policy "unit_turn_tasks_all" on unit_turn_tasks
  for all to anon, authenticated using (true) with check (true);

grant all on unit_turns to anon, authenticated;
grant all on unit_turn_tasks to anon, authenticated;

drop trigger if exists unit_turns_touch on unit_turns;
create trigger unit_turns_touch
  before update on unit_turns
  for each row execute function rubs_touch_updated_at();

drop trigger if exists unit_turn_tasks_touch on unit_turn_tasks;
create trigger unit_turn_tasks_touch
  before update on unit_turn_tasks
  for each row execute function rubs_touch_updated_at();
