-- Up Migration

CREATE TABLE contacts (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      uuid        NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  display_name text        NOT NULL,
  email        text        NOT NULL,
  phone        text,
  company      text,
  notes        text,
  favorite     boolean     NOT NULL DEFAULT false,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX contacts_user_email_lower_idx ON contacts (user_id, lower(email));
CREATE INDEX contacts_user_name_lower_idx ON contacts (user_id, lower(display_name));

-- Down Migration

DROP TABLE IF EXISTS contacts;
