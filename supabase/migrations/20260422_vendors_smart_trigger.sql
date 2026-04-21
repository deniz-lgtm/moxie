-- ============================================
-- Smart updated_at trigger for vendors
-- ============================================
-- The original trigger (`rubs_touch_updated_at`) bumps updated_at on ANY
-- column change. That makes a Notion sync look like a local edit on the
-- next round (sync writes notion_last_synced_at → trigger bumps
-- updated_at → sync sees updated_at > notion_last_synced_at → spurious
-- push back to Notion).
--
-- Replace with a vendors-specific trigger that only bumps updated_at
-- when an actual data column changes. Sync-metadata-only updates
-- (notion_page_id, notion_last_synced_at, raw) leave updated_at alone.

create or replace function vendors_touch_updated_at() returns trigger as $$
begin
  if old.name is distinct from new.name
    or old.category is distinct from new.category
    or old.scope is distinct from new.scope
    or old.phone is distinct from new.phone
    or old.email is distinct from new.email
    or old.website is distinct from new.website
    or old.address is distinct from new.address
    or old.contact_name is distinct from new.contact_name
    or old.license_number is distinct from new.license_number
    or old.insurance_expiry is distinct from new.insurance_expiry
    or old.status is distinct from new.status
    or old.rating is distinct from new.rating
    or old.notes is distinct from new.notes
    or old.is_internal is distinct from new.is_internal
  then
    new.updated_at = now();
  end if;
  return new;
end;
$$ language plpgsql;

drop trigger if exists vendors_touch on vendors;
create trigger vendors_touch
  before update on vendors
  for each row execute function vendors_touch_updated_at();
