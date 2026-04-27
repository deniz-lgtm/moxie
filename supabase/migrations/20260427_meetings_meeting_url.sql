-- ============================================
-- Meetings: add meeting_url
-- ============================================
-- We dropped the in-browser recorder in favor of pasting transcripts from
-- Google Meet. Store the call link on the meeting so anyone joining can
-- click straight into the call from the meeting page.

alter table property_meetings
  add column if not exists meeting_url text;
