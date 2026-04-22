-- ============================================
-- Property P&L Line Items (monthly)
-- ============================================
-- One row per (property, month, category) so the team can enter
-- operating expenses (and supplementary income) month by month and
-- later roll up into NOI comparisons across the portfolio. Rent itself
-- is NOT stored here — it's derived from the AppFolio rent roll — so
-- this table is strictly for Moxie-entered data that AppFolio doesn't
-- give us a clean feed for (utilities, trash, landscaping, mgmt fees,
-- debt service, parking income, laundry income, etc.).
--
-- `month` is YYYY-MM-01 (first of month) as DATE for native range
-- queries. `category` is free-form text with a suggested canonical
-- set enforced by the UI, not the DB, so the team can introduce new
-- buckets without a migration.

create table if not exists property_pnl_line_items (
  id text primary key,
  property_id text not null,
  month date not null,                 -- always the 1st of the month
  category text not null,              -- e.g. utilities, property_mgmt, insurance, property_tax, other_income
  amount numeric not null default 0,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- One row per property × month × category (can upsert by this key).
create unique index if not exists property_pnl_line_items_prop_month_cat_idx
  on property_pnl_line_items (property_id, month, category);

create index if not exists property_pnl_line_items_property_idx
  on property_pnl_line_items (property_id);
create index if not exists property_pnl_line_items_month_idx
  on property_pnl_line_items (month);

alter table property_pnl_line_items enable row level security;
drop policy if exists "property_pnl_line_items_all" on property_pnl_line_items;
create policy "property_pnl_line_items_all" on property_pnl_line_items
  for all to anon, authenticated using (true) with check (true);

grant all on property_pnl_line_items to anon, authenticated;

drop trigger if exists property_pnl_line_items_touch on property_pnl_line_items;
create trigger property_pnl_line_items_touch
  before update on property_pnl_line_items
  for each row execute function rubs_touch_updated_at();
