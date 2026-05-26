-- Add a default hourly labor rate to vendors, used when generating
-- contractor invoices for move-out inspections.
alter table vendors add column if not exists labor_rate numeric;
