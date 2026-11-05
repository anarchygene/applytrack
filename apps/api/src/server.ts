import { buildApp } from './app.js';
import { loadConfig } from './config.js';
import { createDatabase } from './db/client.js';
import { runMigrations } from './db/migrate.js';
import { startDemoCleanup } from './jobs/demo-cleanup.js';
import { ClaudeTailoringProvider } from './modules/tailoring/provider.js';

const config = loadConfig();
// Migrations go over the direct connection when one is given: PgBouncer's transaction pooling
// does not support the session state some migration statements rely on.
if (config.MIGRATE_ON_START) {
  await runMigrations(config.DATABASE_URL_UNPOOLED ?? config.DATABASE_URL);
}
const { db, pool } = createDatabase(config.DATABASE_URL);
const tailoring = config.ANTHROPIC_API_KEY
  ? new ClaudeTailoringProvider(config.ANTHROPIC_API_KEY, config.ANTHROPIC_MODEL)
  : null;

const app = await buildApp({ config, db, pool, tailoring, now: () => new Date() });
const stopCleanup = startDemoCleanup(app);

app.log.info(
  { aiEnabled: tailoring !== null, model: tailoring?.model, servingWeb: !!config.WEB_DIST_DIR },
  'starting ApplyTrack API',
);

let shuttingDown = false;
async function shutdown(signal: string) {
  if (shuttingDown) return;
  shuttingDown = true;
  app.log.info({ signal }, 'shutting down');
  const forceExit = setTimeout(() => process.exit(1), 10_000).unref();
  try {
    stopCleanup();
    await app.close();
    await pool.end();
    clearTimeout(forceExit);
    process.exit(0);
  } catch (error) {
    app.log.error({ err: error }, 'error during shutdown');
    process.exit(1);
  }
}
process.on('SIGTERM', () => void shutdown('SIGTERM'));
process.on('SIGINT', () => void shutdown('SIGINT'));

try {
  await app.listen({ host: config.HOST, port: config.PORT });
} catch (error) {
  app.log.error({ err: error }, 'failed to start');
  await pool.end();
  process.exit(1);
}
