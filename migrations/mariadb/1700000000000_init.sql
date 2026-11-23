-- Up Migration

-- Singleton branding / app configuration (id is always 1).
CREATE TABLE IF NOT EXISTS app_settings (
  id            integer PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  app_name      text        NOT NULL DEFAULT 'jmail',
  logo_url      text,
  primary_color text        NOT NULL DEFAULT '#2f6fed',
  login_message text,
  updated_at    datetime(3) NOT NULL DEFAULT current_timestamp(3)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin;
INSERT INTO app_settings (id) VALUES (1) ON DUPLICATE KEY UPDATE id = 1;

-- Users, provisioned on first OIDC login.
CREATE TABLE IF NOT EXISTS users (
  id            uuid PRIMARY KEY DEFAULT (uuid()),
  oidc_sub      varchar(255)        NOT NULL UNIQUE,
  email         varchar(320)        NOT NULL,
  email_lower varchar(320) GENERATED ALWAYS AS (lower(email)) STORED,
  display_name  text,
  is_admin      boolean     NOT NULL DEFAULT false,
  created_at    datetime(3) NOT NULL DEFAULT current_timestamp(3),
  last_login_at datetime(3)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin;
CREATE UNIQUE INDEX IF NOT EXISTS users_email_lower_idx ON users (email_lower);

-- Server-side sessions (cookie holds only the opaque session id).
CREATE TABLE IF NOT EXISTS sessions (
  sid        varchar(128) CHARACTER SET ascii COLLATE ascii_bin PRIMARY KEY,
  user_id    uuid REFERENCES users (id) ON DELETE CASCADE,
  data       json        NOT NULL DEFAULT '{}',
  expires_at datetime(3) NOT NULL,
  created_at datetime(3) NOT NULL DEFAULT current_timestamp(3)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin;
CREATE INDEX IF NOT EXISTS sessions_expires_at_idx ON sessions (expires_at);
CREATE INDEX IF NOT EXISTS sessions_user_id_idx ON sessions (user_id);

-- OAuth tokens per session, encrypted at rest (AES-256-GCM).
CREATE TABLE IF NOT EXISTS oauth_tokens (
  sid                      varchar(128) CHARACTER SET ascii COLLATE ascii_bin PRIMARY KEY REFERENCES sessions (sid) ON DELETE CASCADE,
  access_token_enc         text        NOT NULL,
  access_token_expires_at  datetime(3) NOT NULL,
  refresh_token_enc        text,
  updated_at               datetime(3) NOT NULL DEFAULT current_timestamp(3)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin;

-- Per-user jmail UI preferences (mailbox content stays in IMAP).
CREATE TABLE IF NOT EXISTS user_prefs (
  user_id            uuid PRIMARY KEY REFERENCES users (id) ON DELETE CASCADE,
  signature          text,
  layout             text        NOT NULL DEFAULT 'comfortable',
  show_remote_images boolean     NOT NULL DEFAULT false,
  prefs              json        NOT NULL DEFAULT '{}',
  updated_at         datetime(3) NOT NULL DEFAULT current_timestamp(3)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin;

-- Audit log for admin actions and jmail-agent calls.
CREATE TABLE IF NOT EXISTS audit_log (
  id         bigint AUTO_INCREMENT PRIMARY KEY,
  user_id    uuid REFERENCES users (id) ON DELETE SET NULL,
  action     text        NOT NULL,
  target     text,
  detail     json        NOT NULL DEFAULT '{}',
  result     text        NOT NULL DEFAULT 'ok',
  created_at datetime(3) NOT NULL DEFAULT current_timestamp(3)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin;
CREATE INDEX IF NOT EXISTS audit_log_created_at_idx ON audit_log (created_at DESC);

-- Down Migration

DROP TABLE IF EXISTS audit_log;
DROP TABLE IF EXISTS user_prefs;
DROP TABLE IF EXISTS oauth_tokens;
DROP TABLE IF EXISTS sessions;
DROP TABLE IF EXISTS users;
DROP TABLE IF EXISTS app_settings;
