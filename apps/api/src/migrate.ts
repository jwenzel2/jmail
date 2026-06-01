/**
 * Minimal ESM-native SQL migration runner.
 *
 * Migrations live in /migrations as `<sortable-prefix>_<name>.sql` and use the
 * markers `-- Up Migration` / `-- Down Migration` (same format node-pg-migrate
 * emits). Applied migrations are tracked in the `schema_migrations` table.
 *
 *   tsx src/migrate.ts up          # apply all pending (default)
 *   tsx src/migrate.ts down        # revert the most recently applied
 *   tsx src/migrate.ts create name # scaffold a new migration file
 */
import { readdir, readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import pg from 'pg';
import { config } from './config.js';

const MIGRATIONS_DIR = fileURLToPath(new URL('../../../migrations', import.meta.url));
const DOWN_MARKER = /^--\s*Down Migration\s*$/im;
const UP_MARKER = /^--\s*Up Migration\s*$/im;

function splitMigration(sql: string): { up: string; down: string } {
  const parts = sql.split(DOWN_MARKER);
  const up = (parts[0] ?? '').replace(UP_MARKER, '').trim();
  const down = (parts[1] ?? '').trim();
  return { up, down };
}

async function listMigrationFiles(): Promise<string[]> {
  const files = await readdir(MIGRATIONS_DIR);
  return files.filter((f) => f.endsWith('.sql')).sort();
}

async function ensureTable(client: pg.PoolClient): Promise<void> {
  await client.query(
    `create table if not exists schema_migrations (
       name text primary key,
       applied_at timestamptz not null default now()
     )`,
  );
}

async function appliedSet(client: pg.PoolClient): Promise<Set<string>> {
  const { rows } = await client.query<{ name: string }>('select name from schema_migrations');
  return new Set(rows.map((r) => r.name));
}

async function up(): Promise<void> {
  const pool = new pg.Pool({ connectionString: config.DATABASE_URL });
  const client = await pool.connect();
  try {
    await ensureTable(client);
    const applied = await appliedSet(client);
    const files = await listMigrationFiles();
    const pending = files.filter((f) => !applied.has(f));
    if (pending.length === 0) {
      console.log('No pending migrations.');
      return;
    }
    for (const file of pending) {
      const sql = await readFile(`${MIGRATIONS_DIR}/${file}`, 'utf8');
      const { up: upSql } = splitMigration(sql);
      console.log(`Applying ${file} …`);
      await client.query('begin');
      try {
        if (upSql) await client.query(upSql);
        await client.query('insert into schema_migrations (name) values ($1)', [file]);
        await client.query('commit');
      } catch (err) {
        await client.query('rollback');
        throw err;
      }
    }
    console.log(`Applied ${pending.length} migration(s).`);
  } finally {
    client.release();
    await pool.end();
  }
}

async function down(): Promise<void> {
  const pool = new pg.Pool({ connectionString: config.DATABASE_URL });
  const client = await pool.connect();
  try {
    await ensureTable(client);
    const { rows } = await client.query<{ name: string }>(
      'select name from schema_migrations order by name desc limit 1',
    );
    const last = rows[0]?.name;
    if (!last) {
      console.log('Nothing to revert.');
      return;
    }
    const sql = await readFile(`${MIGRATIONS_DIR}/${last}`, 'utf8');
    const { down: downSql } = splitMigration(sql);
    console.log(`Reverting ${last} …`);
    await client.query('begin');
    try {
      if (downSql) await client.query(downSql);
      await client.query('delete from schema_migrations where name = $1', [last]);
      await client.query('commit');
    } catch (err) {
      await client.query('rollback');
      throw err;
    }
    console.log(`Reverted ${last}.`);
  } finally {
    client.release();
    await pool.end();
  }
}

async function create(name: string): Promise<void> {
  if (!name) throw new Error('Usage: migrate create <name>');
  const slug = name.trim().toLowerCase().replace(/[^a-z0-9]+/g, '_');
  const file = `${Date.now()}_${slug}.sql`;
  const template = `-- Up Migration\n\n\n-- Down Migration\n\n`;
  await writeFile(`${MIGRATIONS_DIR}/${file}`, template, { flag: 'wx' });
  console.log(`Created migrations/${file}`);
}

async function main(): Promise<void> {
  const [cmd, ...rest] = process.argv.slice(2);
  switch (cmd ?? 'up') {
    case 'up':
      await up();
      break;
    case 'down':
      await down();
      break;
    case 'create':
      await create(rest.join(' '));
      break;
    default:
      console.error(`Unknown command: ${cmd}`);
      process.exit(1);
  }
}

main().catch((err: unknown) => {
  console.error(err);
  process.exit(1);
});
