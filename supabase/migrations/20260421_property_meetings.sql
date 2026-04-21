-- ============================================
-- Property Meetings (Monday morning meetings)
-- ============================================
-- One row per meeting held for a property. Audio is recorded client-side,
-- transcribed (browser SpeechRecognition or server-side), and then passed
-- through Claude to extract action items into `meeting_action_items`.
-- `agenda_snapshot` freezes the open work orders / vacancies surfaced at
-- meeting creation time so the agenda stays stable even after AppFolio syncs.

create table if not exists property_meetings (
  id text primary key,
  property_id text not null,
  property_name text not null,
  meeting_date date not null,
  status text not null default 'scheduled',       -- scheduled | in_progress | completed
  title text,
  audio_url text,                                  -- optional — stored blob url
  transcript text,
  summary text,
  notes text,
  agenda_snapshot jsonb not null default '{}'::jsonb,  -- { workOrders: [...], vacancies: [...], carryOverActions: [...] }
  attendees jsonb not null default '[]'::jsonb,        -- string[] of names
  recorded_at timestamptz,
  recording_duration_seconds int,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists property_meetings_property_id_idx on property_meetings (property_id);
create index if not exists property_meetings_meeting_date_idx on property_meetings (meeting_date desc);
create index if not exists property_meetings_status_idx on property_meetings (status);

alter table property_meetings disable row level security;
grant all on property_meetings to anon, authenticated;

drop trigger if exists property_meetings_touch on property_meetings;
create trigger property_meetings_touch
  before update on property_meetings
  for each row execute function rubs_touch_updated_at();


-- ============================================
-- Meeting Action Items (task board)
-- ============================================
-- Tasks generated from a meeting's transcript (or added manually). Reviewed
-- at the top of the next meeting — open items from prior meetings are shown
-- in the new meeting's agenda so the team can mark progress.

create table if not exists meeting_action_items (
  id text primary key,
  meeting_id text not null references property_meetings(id) on delete cascade,
  property_id text not null,
  title text not null,
  description text,
  assigned_to text,
  due_date date,
  status text not null default 'open',              -- open | in_progress | completed | cancelled
  priority text,                                    -- low | medium | high | null
  source text not null default 'manual',            -- manual | transcript | work_order | vacancy
  completed_at timestamptz,
  completed_by text,
  linked_work_order_id text,                        -- optional fk to work_orders.id (no cascade)
  linked_unit_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists meeting_action_items_meeting_id_idx on meeting_action_items (meeting_id);
create index if not exists meeting_action_items_property_id_idx on meeting_action_items (property_id);
create index if not exists meeting_action_items_status_idx on meeting_action_items (status);
create index if not exists meeting_action_items_due_date_idx on meeting_action_items (due_date);

alter table meeting_action_items disable row level security;
grant all on meeting_action_items to anon, authenticated;

drop trigger if exists meeting_action_items_touch on meeting_action_items;
create trigger meeting_action_items_touch
  before update on meeting_action_items
  for each row execute function rubs_touch_updated_at();
