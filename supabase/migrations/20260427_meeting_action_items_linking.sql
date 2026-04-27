-- Action item linking — many-to-many between meeting_action_items
--
-- Stored as a text[] of related item ids on each row. Symmetric: when
-- A links to B, both rows hold the other's id. Keeping it on each row
-- (vs a join table) is enough for the editor UI we're shipping and
-- avoids a join on the read path.

alter table meeting_action_items
  add column if not exists linked_action_item_ids text[] not null default '{}';
