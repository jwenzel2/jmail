import { config as loadDotenv } from 'dotenv';
import { z } from 'zod';

// Load .env from the repo root (two levels up from apps/api when running via tsx/node).
loadDotenv({ path: new URL('../../../.env', import.meta.url).pathname });

const bool = (def: boolean) =>
  z
    .enum(['true', 'false'])
    .transform((v) => v === 'true')
    .default(def ? 'true' : 'false');

const csv = z
  .string()
  .default('')
  .transform((v) =>
    v
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean),
  );

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  API_HOST: z.string().default('127.0.0.1'),
  API_PORT: z.coerce.number().int().positive().default(4000),
  PUBLIC_URL: z.string().url().default('http://localhost:5173'),
  CORS_ORIGINS: csv,

  DATABASE_URL: z.string().min(1),

  SESSION_SECRET: z.string().min(16),
  TOKEN_ENCRYPTION_KEY: z
    .string()
    .regex(/^[0-9a-fA-F]{64}$/, 'TOKEN_ENCRYPTION_KEY must be 64 hex chars (32 bytes)'),

  // OIDC (wired up in Milestone 1).
  OIDC_ISSUER_URL: z.string().url().optional(),
  OIDC_CLIENT_ID: z.string().optional(),
  OIDC_CLIENT_SECRET: z.string().optional(),
  OIDC_REDIRECT_URI: z.string().url().optional(),
  OIDC_SCOPES: z.string().default('openid profile email offline_access'),
  OIDC_ADMIN_CLAIM: z.string().optional(),

  // Mail servers (Milestone 2).
  IMAP_HOST: z.string().optional(),
  IMAP_PORT: z.coerce.number().int().positive().default(993),
  IMAP_SECURE: bool(true),
  // Set to false in dev to accept self-signed mail-server certificates.
  IMAP_TLS_REJECT_UNAUTHORIZED: bool(true),
  SMTP_HOST: z.string().optional(),
  SMTP_PORT: z.coerce.number().int().positive().default(587),
  SMTP_SECURE: bool(false),
  SMTP_TLS_REJECT_UNAUTHORIZED: bool(true),

  // jmail-agent (Milestone 3).
  AGENT_URL: z.string().url().optional(),
  AGENT_TOKEN: z.string().optional(),
});

const parsed = envSchema.safeParse(process.env);
if (!parsed.success) {
  const issues = parsed.error.issues
    .map((i) => `  - ${i.path.join('.') || '(root)'}: ${i.message}`)
    .join('\n');
  console.error(`Invalid environment configuration:\n${issues}`);
  process.exit(1);
}

export const config = parsed.data;
export type Config = typeof config;

export const isProd = config.NODE_ENV === 'production';
