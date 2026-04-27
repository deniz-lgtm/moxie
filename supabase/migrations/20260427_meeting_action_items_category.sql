-- ============================================
-- Meeting action items: add category
-- ============================================
-- Lets the meeting page render manually-added items inside the right
-- agenda card (Review / Leasing / Maintenance / Property Management)
-- alongside the AppFolio-pulled rows. Existing rows have no category;
-- the meeting view treats them as uncategorized and shows them in the
-- bottom action items board only.

alter table meeting_action_items
  add column if not exists category text;

create index if not exists meeting_action_items_category_idx
  on meeting_action_items (category);
