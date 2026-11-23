-- Up Migration

CREATE TABLE IF NOT EXISTS calendar_events (
  id          uuid PRIMARY KEY DEFAULT (uuid()),
  user_id     uuid        NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  ical_uid    text        NOT NULL,
  title       text        NOT NULL,
  description mediumtext,
  location    text,
  starts_at   datetime(3) NOT NULL,
  ends_at     datetime(3) NOT NULL,
  all_day     boolean     NOT NULL DEFAULT false,
  created_at  datetime(3) NOT NULL DEFAULT current_timestamp(3),
  updated_at  datetime(3) NOT NULL DEFAULT current_timestamp(3),
  CHECK (ends_at > starts_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin;
CREATE UNIQUE INDEX IF NOT EXISTS calendar_events_user_ical_uid_idx ON calendar_events (user_id, ical_uid);
CREATE INDEX IF NOT EXISTS calendar_events_user_range_idx ON calendar_events (user_id, starts_at, ends_at);

-- Down Migration

DROP TABLE IF EXISTS calendar_events;
