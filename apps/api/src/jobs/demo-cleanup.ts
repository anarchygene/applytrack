import type { FastifyInstance } from 'fastify';
import { deleteDemoUsersCreatedBefore, deleteExpiredSessions } from '../modules/auth/repository.js';

export const DEMO_TTL_MS = 24 * 60 * 60 * 1000;
const INTERVAL_MS = 15 * 60 * 1000;

/** Deletes demo accounts older than 24 hours (cascading to their data) and expired sessions. */
export async function runDemoCleanup(app: FastifyInstance): Promise<number> {
  const { db, now } = app.deps;
  const current = now();
  const removed = await deleteDemoUsersCreatedBefore(db, new Date(current.getTime() - DEMO_TTL_MS));
  await deleteExpiredSessions(db, current);
  if (removed > 0) app.log.info({ removed }, 'removed expired demo accounts');
  return removed;
}

/** Runs the cleanup at startup and then every 15 minutes; returns a stop function. */
export function startDemoCleanup(app: FastifyInstance): () => void {
  const run = () =>
    runDemoCleanup(app).catch((error: unknown) =>
      app.log.error({ err: error }, 'demo cleanup failed'),
    );
  void run();
  const timer = setInterval(run, INTERVAL_MS);
  timer.unref();
  return () => clearInterval(timer);
}
