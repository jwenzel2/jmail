-- Up Migration

CREATE TABLE IF NOT EXISTS mobile_tokens (
  token_hash  varchar(128) CHARACTER SET ascii COLLATE ascii_bin PRIMARY KEY,
  user_id     uuid        NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  sid         varchar(128) CHARACTER SET ascii COLLATE ascii_bin        NOT NULL REFERENCES sessions (sid) ON DELETE CASCADE,
  expires_at  datetime(3) NOT NULL,
  created_at  datetime(3) NOT NULL DEFAULT current_timestamp(3),
  last_used_at datetime(3)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin;
CREATE INDEX IF NOT EXISTS mobile_tokens_user_id_idx ON mobile_tokens (user_id);
CREATE INDEX IF NOT EXISTS mobile_tokens_expires_at_idx ON mobile_tokens (expires_at);

CREATE TABLE IF NOT EXISTS mobile_auth_transactions (
  state         varchar(128) CHARACTER SET ascii COLLATE ascii_bin PRIMARY KEY,
  verifier      text        NOT NULL,
  nonce         text        NOT NULL,
  redirect_uri  text        NOT NULL,
  expires_at    datetime(3) NOT NULL,
  created_at    datetime(3) NOT NULL DEFAULT current_timestamp(3)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin;

CREATE TABLE IF NOT EXISTS mobile_auth_codes (
  code_hash    varchar(128) CHARACTER SET ascii COLLATE ascii_bin PRIMARY KEY,
  user_id      uuid        NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  sid          varchar(128) CHARACTER SET ascii COLLATE ascii_bin        NOT NULL REFERENCES sessions (sid) ON DELETE CASCADE,
  expires_at   datetime(3) NOT NULL,
  created_at   datetime(3) NOT NULL DEFAULT current_timestamp(3)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin;

CREATE TABLE IF NOT EXISTS mail_accounts (
  id                uuid PRIMARY KEY DEFAULT (uuid()),
  user_id           uuid        NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  email             varchar(320)        NOT NULL,
  email_lower varchar(320) GENERATED ALWAYS AS (lower(email)) STORED,
  display_name      text,
  protocol          text        NOT NULL CHECK (protocol IN ('imap', 'pop3')),
  auth_type         text        NOT NULL CHECK (auth_type IN ('password', 'keycloak', 'google', 'microsoft')),
  imap_host         text,
  imap_port         integer,
  smtp_host         text        NOT NULL,
  smtp_port         integer     NOT NULL,
  username          text        NOT NULL,
  secret_enc        text,
  enabled           boolean     NOT NULL DEFAULT true,
  status            text        NOT NULL DEFAULT 'pending'
                    CHECK (status IN ('pending', 'ready', 'error', 'reauth_required')),
  last_error        text,
  capabilities      json        NOT NULL DEFAULT '{}',
  settings          json        NOT NULL DEFAULT '{}',
  created_at        datetime(3) NOT NULL DEFAULT current_timestamp(3),
  updated_at        datetime(3) NOT NULL DEFAULT current_timestamp(3)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin;
CREATE UNIQUE INDEX IF NOT EXISTS mail_accounts_user_email_idx ON mail_accounts (user_id, email_lower);
CREATE INDEX IF NOT EXISTS mail_accounts_user_id_idx ON mail_accounts (user_id);

CREATE TABLE IF NOT EXISTS mobile_devices (
  id                    uuid PRIMARY KEY DEFAULT (uuid()),
  user_id               uuid        NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  installation_id       varchar(255)        NOT NULL,
  fcm_token             text        NOT NULL,
  device_name           text,
  notifications_enabled boolean     NOT NULL DEFAULT true,
  created_at            datetime(3) NOT NULL DEFAULT current_timestamp(3),
  updated_at            datetime(3) NOT NULL DEFAULT current_timestamp(3),
  UNIQUE (user_id, installation_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin;
CREATE UNIQUE INDEX IF NOT EXISTS mobile_devices_fcm_token_idx ON mobile_devices (fcm_token);

-- Down Migration

DROP TABLE IF EXISTS mobile_devices;
DROP TABLE IF EXISTS mail_accounts;
DROP TABLE IF EXISTS mobile_auth_codes;
DROP TABLE IF EXISTS mobile_auth_transactions;
DROP TABLE IF EXISTS mobile_tokens;
