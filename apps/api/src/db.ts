import pg from 'pg';
import { config } from './config.js';

/** Shared PostgreSQL connection pool for jmail app data. */
export const pool = new pg.Pool({ connectionString: config.DATABASE_URL });

export type DbPool = typeof pool;

export async function closePool(): Promise<void> {
  await pool.end();
}
