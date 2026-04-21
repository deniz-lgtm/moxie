-- ============================================
-- Meetings: drop per-property scoping
-- ============================================
-- Meetings turned out to be internal team meetings, not per-property.
-- Make property_id / property_name nullable so new meetings can sit at
-- the portfolio level. Existing rows keep their values; going forward
-- these columns are only populated when an item is explicitly scoped to
-- one property (rare — individual action items still use linked_unit_id
-- / linked_work_order_id for that).

alter table property_meetings
  alter column property_id drop not null,
  alter column property_name drop not null;

alter table meeting_action_items
  alter column property_id drop not null;
