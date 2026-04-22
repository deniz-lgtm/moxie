-- ============================================
-- Capital Projects (moved from localStorage → Supabase)
-- ============================================
-- Previously the /capital-projects page kept projects in the user's
-- browser localStorage, which meant a capex project one team member
-- added wasn't visible to anyone else (and couldn't be rolled up in
-- the portfolio view). Move to Supabase so the portfolio page can
-- show Active Capex ($) per property across the team.

create table if not exists capital_projects (
  id text primary key,
  property_id text not null,
  property_name text,
  name text not null,
  category text,              -- roof | hvac | plumbing | electrical | renovation | landscaping | other
  status text not null default 'planning',  -- planning | in_progress | completed | on_hold
  start_date date,
  target_date date,
  completed_date date,
  budget numeric,
  spent numeric not null default 0,
  contractor text,
  description text,
  milestones jsonb not null default '[]'::jsonb,   -- [{ id, name, completed, date }]
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists capital_projects_property_id_idx on capital_projects (property_id);
create index if not exists capital_projects_status_idx on capital_projects (status);
create index if not exists capital_projects_target_date_idx on capital_projects (target_date);

alter table capital_projects enable row level security;
drop policy if exists "capital_projects_all" on capital_projects;
create policy "capital_projects_all" on capital_projects
  for all to anon, authenticated using (true) with check (true);

grant all on capital_projects to anon, authenticated;

drop trigger if exists capital_projects_touch on capital_projects;
create trigger capital_projects_touch
  before update on capital_projects
  for each row execute function rubs_touch_updated_at();
