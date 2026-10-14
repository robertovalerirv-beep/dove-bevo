-- v1.1 (ADR 0018, 0019): no AI, so no AI budget table; user-proposed bars carry their proposal day
-- (the trace of a rejected proposal lasts 30 days) and are counted by status for the 200 cap.
DROP TABLE IF EXISTS ai_usage;
ALTER TABLE venues_user ADD COLUMN day TEXT;
CREATE INDEX vu_status ON venues_user (status);
