import { runMigrations } from '../../src/db/migrate.js';
import { TEST_DATABASE_URL } from './db-url.js';

/** Applies migrations to the test database once before any integration test file runs. */
export default async function setup() {
  try {
    await runMigrations(TEST_DATABASE_URL);
  } catch (error) {
    throw new Error(
      `Could not migrate the test database at ${TEST_DATABASE_URL}. ` +
        'Start it with `docker compose up -d db` or set TEST_DATABASE_URL.',
      { cause: error },
    );
  }
}
