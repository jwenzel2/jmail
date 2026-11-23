import pg from 'pg';
import mariadb, { type UpsertResult } from 'mariadb';
import { config } from './config.js';

export const isMaria = config.DATABASE_URL.startsWith('mariadb:');
type Query = <T extends object = Record<string, unknown>>(
  sql: string,
  params?: unknown[],
) => Promise<{ rows: T[]; rowCount: number | null }>;

export interface Client {
  query: Query;
  release(): void;
}

export function createPool(migrations = false) {
  if (!isMaria) {
    const postgres = new pg.Pool({ connectionString: config.DATABASE_URL });
    return {
      connect: async (): Promise<Client> => {
        const client = await postgres.connect();
        return {
          query: (sql, params) => client.query(sql, params),
          release: () => client.release(),
        };
      },
      end: () => postgres.end(),
    };
  }

  const uri = new URL(config.DATABASE_URL);
  uri.searchParams.set('timezone', '+00:00');
  uri.searchParams.set('multipleStatements', String(migrations));
  uri.searchParams.set('minimumIdle', '0');
  const maria = mariadb.createPool(uri.toString());
  return {
    connect: async (): Promise<Client> => {
      const conn = await maria.getConnection();
      const query: Query = async <T extends object>(sql: string, params: unknown[] = []) => {
        const bindings: unknown[] = [];
        const statement = !params.length
          ? sql
          : sql.replace(/\$(\d+)/g, (_, index: string) => {
              bindings.push(params[Number(index) - 1] ?? null);
              return '?';
            });
        const result = await conn.query<T[] | UpsertResult>(
          {
            sql: statement,
            typeCast: (field, next) =>
              field.type === 'TINY' && field.columnLength === 1 ? Boolean(field.tiny()) : next(),
          },
          bindings,
        );
        if (Array.isArray(result)) return { rows: result, rowCount: result.length };
        return { rows: [], rowCount: result.affectedRows };
      };
      return {
        query,
        release: () => {
          void conn.release();
        },
      };
    },
    end: () => maria.end(),
  };
}

const driver = createPool();
const query: Query = async <T extends object>(sql: string, params?: unknown[]) => {
  const client = await driver.connect();
  try {
    return await client.query<T>(sql, params);
  } finally {
    client.release();
  }
};

export const pool = { ...driver, query };
export const closePool = driver.end;

export async function transaction<T>(work: (client: Client) => Promise<T>): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query('begin');
    const value = await work(client);
    await client.query('commit');
    return value;
  } catch (err) {
    await client.query('rollback');
    throw err;
  } finally {
    client.release();
  }
}

export function upsertClause(keys: string[], columns: string[]): string {
  const updates = columns.map((c) => (isMaria ? `${c}=values(${c})` : `${c}=excluded.${c}`));
  updates.push('updated_at=now()');
  return (
    (isMaria ? 'on duplicate key update ' : `on conflict (${keys.join(',')}) do update set `) +
    updates.join(',')
  );
}

export function expiresIn(seconds: string): string {
  return isMaria
    ? `date_add(now(), interval ${seconds} second)`
    : `now() + (${seconds} || ' seconds')::interval`;
}
