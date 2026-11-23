-- Up Migration

CREATE TABLE IF NOT EXISTS contacts (
  id           uuid PRIMARY KEY DEFAULT (uuid()),
  user_id      uuid        NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  display_name text        NOT NULL,
  email        varchar(320)        NOT NULL,
  email_lower varchar(320) GENERATED ALWAYS AS (lower(email)) STORED,
  phone        text,
  company      text,
  notes        text,
  favorite     boolean     NOT NULL DEFAULT false,
  created_at   datetime(3) NOT NULL DEFAULT current_timestamp(3),
  updated_at   datetime(3) NOT NULL DEFAULT current_timestamp(3)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin;
CREATE UNIQUE INDEX IF NOT EXISTS contacts_user_email_lower_idx ON contacts (user_id, email_lower);
CREATE INDEX IF NOT EXISTS contacts_user_name_lower_idx ON contacts (user_id, display_name(191));

-- Down Migration

DROP TABLE IF EXISTS contacts;
