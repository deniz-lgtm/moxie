-- Add `scope` column to vendors for free-form service descriptions
-- (what a vendor actually does, beyond their category). Idempotent.

alter table vendors add column if not exists scope text;

create index if not exists vendors_scope_idx on vendors (scope);
