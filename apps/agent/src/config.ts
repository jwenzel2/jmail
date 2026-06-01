import { config as loadDotenv } from 'dotenv';
import { z } from 'zod';

// In production the agent reads its own /etc/jmail/agent.env; for the dev
// monorepo it shares the repo-root .env.
loadDotenv({ path: new URL('../../../.env', import.meta.url).pathname });

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  AGENT_HOST: z.string().default('0.0.0.0'),
  AGENT_PORT: z.coerce.number().int().positive().default(4100),
  AGENT_SHARED_TOKEN: z.string().min(16),

  // SpamAssassin integration (used in Milestone 3).
  SA_GLOBAL_CONFIG: z.string().default('/etc/spamassassin/local.cf'),
  SA_USER_PREFS_DIR: z.string().default('/var/lib/spamassassin'),
  SA_LEARN_CMD: z.string().default('sa-learn'),
  SPAMASSASSIN_LINT_CMD: z.string().default('spamassassin --lint'),
  SPAMD_RELOAD_CMD: z.string().default('systemctl reload spamassassin'),
});

const parsed = envSchema.safeParse(process.env);
if (!parsed.success) {
  const issues = parsed.error.issues
    .map((i) => `  - ${i.path.join('.') || '(root)'}: ${i.message}`)
    .join('\n');
  console.error(`Invalid jmail-agent configuration:\n${issues}`);
  process.exit(1);
}

export const config = parsed.data;
export type Config = typeof config;
