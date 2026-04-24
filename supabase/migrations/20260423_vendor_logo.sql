-- Add logo storage URL to vendors table.
ALTER TABLE vendors ADD COLUMN IF NOT EXISTS logo_url TEXT;
