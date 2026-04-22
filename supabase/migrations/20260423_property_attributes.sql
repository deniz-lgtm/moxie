-- ============================================
-- Property Attributes (Moxie-side per-property facts)
-- ============================================
-- AppFolio is the source of truth for rent-roll / lease data, but
-- it doesn't track insurance, taxes, or other asset-management facts
-- at the property level. This table is Moxie's overlay — keyed by
-- the AppFolio property_id so /portfolio can roll it up alongside
-- units + work orders + capex.
--
-- Insurance: carrier + policy # + expiration + annual premium.
-- Taxes:     APN + annual amount + next installment due + YTD paid.
-- Notes:     free-form text (compliance, audit, etc.).

create table if not exists property_attributes (
  property_id text primary key,
  insurance_carrier text,
  insurance_policy_number text,
  insurance_expires date,
  insurance_premium_annual numeric,
  tax_apn text,
  tax_annual_amount numeric,
  tax_next_installment_due date,
  tax_ytd_paid numeric,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists property_attributes_insurance_expires_idx
  on property_attributes (insurance_expires);
create index if not exists property_attributes_tax_next_installment_due_idx
  on property_attributes (tax_next_installment_due);

-- Permissive RLS (same pattern as the rest of the Moxie tables).
alter table property_attributes enable row level security;
drop policy if exists "property_attributes_all" on property_attributes;
create policy "property_attributes_all" on property_attributes
  for all to anon, authenticated using (true) with check (true);

grant all on property_attributes to anon, authenticated;

drop trigger if exists property_attributes_touch on property_attributes;
create trigger property_attributes_touch
  before update on property_attributes
  for each row execute function rubs_touch_updated_at();
