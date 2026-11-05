import { fileURLToPath } from 'node:url';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { createDatabase } from './client.js';

/**
 * Applies pending SQL migrations. The folder resolves to apps/api/drizzle from source and to
 * apps/api/dist/drizzle in a build (the build copies it there).
 */
export async function runMigrations(connectionString: string): Promise<void> {
  const { db, pool } = createDatabase(connectionString);
  try {
    const migrationsFolder = fileURLToPath(new URL('../../drizzle', import.meta.url));
    await migrate(db, { migrationsFolder });
  } finally {
    await pool.end();
  }
}
