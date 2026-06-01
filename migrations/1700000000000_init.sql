-- Up Migration

-- Singleton branding / app configuration (id is always 1).
CREATE TABLE app_settings (
  id            integer PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  app_name      text        NOT NULL DEFAULT 'jmail',
  logo_url      text,
  primary_color text        NOT NULL DEFAULT '#2f6fed',
  login_message text,
  updated_at    timestamptz NOT NULL DEFAULT now()
);
INSERT INTO app_settings (id) VALUES (1);

-- Users, provisioned on first OIDC login.
CREATE TABLE users (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  oidc_sub      text        NOT NULL UNIQUE,
  email         text        NOT NULL,
  display_name  text,
  is_admin      boolean     NOT NULL DEFAULT false,
  created_at    timestamptz NOT NULL DEFAULT now(),
  last_login_at timestamptz
);
CREATE UNIQUE INDEX users_email_lower_idx ON users (lower(email));

-- Server-side sessions (cookie holds only the opaque session id).
CREATE TABLE sessions (
  sid        text PRIMARY KEY,
  user_id    uuid REFERENCES users (id) ON DELETE CASCADE,
  data       jsonb       NOT NULL DEFAULT '{}'::jsonb,
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX sessions_expires_at_idx ON sessions (expires_at);
CREATE INDEX sessions_user_id_idx ON sessions (user_id);

-- OAuth tokens per session, encrypted at rest (AES-256-GCM).
CREATE TABLE oauth_tokens (
  sid                      text PRIMARY KEY REFERENCES sessions (sid) ON DELETE CASCADE,
  access_token_enc         text        NOT NULL,
  access_token_expires_at  timestamptz NOT NULL,
  refresh_token_enc        text,
  updated_at               timestamptz NOT NULL DEFAULT now()
);

-- Per-user jmail UI preferences (mailbox content stays in IMAP).
CREATE TABLE user_prefs (
  user_id            uuid PRIMARY KEY REFERENCES users (id) ON DELETE CASCADE,
  signature          text,
  layout             text        NOT NULL DEFAULT 'comfortable',
  show_remote_images boolean     NOT NULL DEFAULT false,
  prefs              jsonb       NOT NULL DEFAULT '{}'::jsonb,
  updated_at         timestamptz NOT NULL DEFAULT now()
);

-- Audit log for admin actions and jmail-agent calls.
CREATE TABLE audit_log (
  id         bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  user_id    uuid REFERENCES users (id) ON DELETE SET NULL,
  action     text        NOT NULL,
  target     text,
  detail     jsonb       NOT NULL DEFAULT '{}'::jsonb,
  result     text        NOT NULL DEFAULT 'ok',
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX audit_log_created_at_idx ON audit_log (created_at DESC);

-- Down Migration

DROP TABLE IF EXISTS audit_log;
DROP TABLE IF EXISTS user_prefs;
DROP TABLE IF EXISTS oauth_tokens;
DROP TABLE IF EXISTS sessions;
DROP TABLE IF EXISTS users;
DROP TABLE IF EXISTS app_settings;
