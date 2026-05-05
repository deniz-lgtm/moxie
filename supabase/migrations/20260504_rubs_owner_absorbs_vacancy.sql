-- ============================================
-- RUBS: owner-absorbs-vacancy toggle on meter mappings
-- ============================================
-- When true, vacant units are excluded from the bill split entirely; the
-- owner absorbs the vacant share rather than redistributing it across the
-- remaining tenants. Defaults to false (preserves existing behavior).

alter table rubs_meter_mappings
  add column if not exists owner_absorbs_vacancy boolean not null default false;
