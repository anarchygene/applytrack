import { drizzle, type NodePgDatabase } from 'drizzle-orm/node-postgres';
import pg from 'pg';
import * as schema from './schema.js';

export type Db = NodePgDatabase<typeof schema>;

/** A database handle usable both at top level and inside a transaction. */
export type DbOrTx = Db | Parameters<Parameters<Db['transaction']>[0]>[0];

export interface Database {
  db: Db;
  pool: pg.Pool;
}

export function createDatabase(connectionString: string): Database {
  // TLS for managed Postgres (e.g. Neon) is configured through `?sslmode=require` in the URL.
  const pool = new pg.Pool({ connectionString, max: 10, idleTimeoutMillis: 30_000 });
  const db = drizzle(pool, { schema });
  return { db, pool };
}
