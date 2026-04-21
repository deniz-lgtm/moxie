-- ============================================
-- RUBS: rename `trash` meter type to `sewer`
-- ============================================
-- We dropped the trash utility and use `sewer` instead. Any rows that
-- were stored before this rename get rewritten in place. Safe to run
-- more than once (idempotent no-op when no trash rows remain).

update rubs_meter_mappings set meter_type = 'sewer' where meter_type = 'trash';
update rubs_bills           set meter_type = 'sewer' where meter_type = 'trash';
