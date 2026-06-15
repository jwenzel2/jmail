-- Up Migration

CREATE TABLE mobile_tokens (
  token_hash  text PRIMARY KEY,
  user_id     uuid        NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  sid         text        NOT NULL REFERENCES sessions (sid) ON DELETE CASCADE,
  expires_at  timestamptz NOT NULL,
  created_at  timestamptz NOT NULL DEFAULT now(),
  last_used_at timestamptz
);
CREATE INDEX mobile_tokens_user_id_idx ON mobile_tokens (user_id);
CREATE INDEX mobile_tokens_expires_at_idx ON mobile_tokens (expires_at);

CREATE TABLE mobile_auth_transactions (
  state         text PRIMARY KEY,
  verifier      text        NOT NULL,
  nonce         text        NOT NULL,
  redirect_uri  text        NOT NULL,
  expires_at    timestamptz NOT NULL,
  created_at    timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE mobile_auth_codes (
  code_hash    text PRIMARY KEY,
  user_id      uuid        NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  sid          text        NOT NULL REFERENCES sessions (sid) ON DELETE CASCADE,
  expires_at   timestamptz NOT NULL,
  created_at   timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE mail_accounts (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id           uuid        NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  email             text        NOT NULL,
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
  capabilities      jsonb       NOT NULL DEFAULT '{}'::jsonb,
  settings          jsonb       NOT NULL DEFAULT '{}'::jsonb,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX mail_accounts_user_email_idx ON mail_accounts (user_id, lower(email));
CREATE INDEX mail_accounts_user_id_idx ON mail_accounts (user_id);

CREATE TABLE mobile_devices (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id               uuid        NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  installation_id       text        NOT NULL,
  fcm_token             text        NOT NULL,
  device_name           text,
  notifications_enabled boolean     NOT NULL DEFAULT true,
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, installation_id)
);
CREATE UNIQUE INDEX mobile_devices_fcm_token_idx ON mobile_devices (fcm_token);

-- Down Migration

DROP TABLE IF EXISTS mobile_devices;
DROP TABLE IF EXISTS mail_accounts;
DROP TABLE IF EXISTS mobile_auth_codes;
DROP TABLE IF EXISTS mobile_auth_transactions;
DROP TABLE IF EXISTS mobile_tokens;
