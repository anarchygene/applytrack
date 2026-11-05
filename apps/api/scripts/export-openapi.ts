/**
 * Writes the OpenAPI document generated from the route schemas to apps/api/openapi.json.
 * CI regenerates it and fails if the committed file differs (contract drift check).
 * No database connection is made: the pool connects lazily and no route is called.
 */
import { writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { buildApp } from '../src/app.js';
import { loadConfig } from '../src/config.js';
import { createDatabase } from '../src/db/client.js';
import { FakeTailoringProvider } from '../src/modules/tailoring/provider.js';

const config = loadConfig({
  NODE_ENV: 'test',
  LOG_LEVEL: 'silent',
  DATABASE_URL: 'postgres://unused:unused@localhost:1/unused',
});
const { db, pool } = createDatabase(config.DATABASE_URL);
const app = await buildApp({
  config,
  db,
  pool,
  tailoring: new FakeTailoringProvider(),
  now: () => new Date(),
});
await app.ready();

const out = fileURLToPath(new URL('../openapi.json', import.meta.url));
await writeFile(out, `${JSON.stringify(app.swagger(), null, 2)}\n`);
await app.close();
await pool.end();
console.log(`Wrote ${out}`);
