-- Up Migration

CREATE TABLE calendar_events (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid        NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  ical_uid    text        NOT NULL,
  title       text        NOT NULL,
  description text,
  location    text,
  starts_at   timestamptz NOT NULL,
  ends_at     timestamptz NOT NULL,
  all_day     boolean     NOT NULL DEFAULT false,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  CHECK (ends_at > starts_at)
);
CREATE UNIQUE INDEX calendar_events_user_ical_uid_idx ON calendar_events (user_id, ical_uid);
CREATE INDEX calendar_events_user_range_idx ON calendar_events (user_id, starts_at, ends_at);

-- Down Migration

DROP TABLE IF EXISTS calendar_events;
