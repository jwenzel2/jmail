-- Up Migration

-- Repeating events are materialized as individual rows sharing a series_id so
-- that "stop repeating from this instance onward" is a simple delete of future
-- rows. `recurrence` records the series frequency on every occurrence.
ALTER TABLE calendar_events
  ADD COLUMN series_id  uuid,
  ADD COLUMN recurrence text
    CHECK (recurrence IN ('daily', 'weekly', 'monthly', 'yearly'));

CREATE INDEX calendar_events_user_series_idx ON calendar_events (user_id, series_id);

-- Down Migration

DROP INDEX IF EXISTS calendar_events_user_series_idx;
ALTER TABLE calendar_events
  DROP COLUMN IF EXISTS series_id,
  DROP COLUMN IF EXISTS recurrence;
