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

/**
 * node-postgres treats `sslmode=require` as `verify-full` today but will switch to libpq's weaker
 * "encrypt, don't verify" meaning in pg v9. Pin the current behaviour so an upgrade cannot
 * silently stop verifying the server certificate (Neon's certificates are publicly trusted).
 */
export function pinSslMode(connectionString: string): string {
  return connectionString.replace(/([?&]sslmode=)require\b/, '$1verify-full');
}

export function createDatabase(url: string): Database {
  const connectionString = pinSslMode(url);
  // node-postgres does not read `channel_binding` from the URL, so honour Neon's
  // `channel_binding=require` explicitly (SCRAM-SHA-256-PLUS, binding auth to the TLS session).
  const pool = new pg.Pool({
    connectionString,
    max: 10,
    idleTimeoutMillis: 30_000,
    enableChannelBinding: /[?&]channel_binding=require\b/.test(connectionString),
  });
  const db = drizzle(pool, { schema });
  return { db, pool };
}
