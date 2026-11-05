import { sql } from 'drizzle-orm';
import type { FastifyInstance, InjectOptions } from 'fastify';
import { afterAll, beforeAll, beforeEach } from 'vitest';
import { buildApp, type AppDeps } from '../../src/app.js';
import { loadConfig, type Config } from '../../src/config.js';
import { createDatabase, type Database } from '../../src/db/client.js';
import type { TailoringProvider } from '../../src/modules/tailoring/provider.js';
import { TEST_DATABASE_URL } from './db-url.js';

export interface TestContext {
  app: FastifyInstance;
  database: Database;
  /** Mutable clock; tests can move time forward. */
  clock: { now: Date };
}

export interface TestOptions {
  tailoring?: TailoringProvider | null;
  config?: Partial<Record<keyof Config, string>>;
  rateLimit?: boolean;
  now?: Date;
}

/**
 * Builds an app against the test database for one test file and truncates all tables before each
 * test. Returns a context object whose fields are populated in `beforeAll`.
 */
export function useTestApp(options: TestOptions = {}): TestContext {
  const ctx = {} as TestContext;

  beforeAll(async () => {
    const config = loadConfig({
      NODE_ENV: 'test',
      LOG_LEVEL: 'silent',
      DATABASE_URL: TEST_DATABASE_URL,
      ...options.config,
    });
    ctx.database = createDatabase(TEST_DATABASE_URL);
    ctx.clock = { now: options.now ?? new Date() };
    const deps: AppDeps = {
      config,
      db: ctx.database.db,
      pool: ctx.database.pool,
      tailoring: options.tailoring ?? null,
      now: () => ctx.clock.now,
      rateLimitDisabled: !options.rateLimit,
    };
    ctx.app = await buildApp(deps);
    await ctx.app.ready();
  });

  beforeEach(async () => {
    await resetDb(ctx.database);
    ctx.clock.now = options.now ?? new Date();
  });

  afterAll(async () => {
    await ctx.app?.close();
    await ctx.database?.pool.end();
  });

  return ctx;
}

export async function resetDb({ db }: Database) {
  await db.execute(
    sql`TRUNCATE users, sessions, applications, stage_events, reminders, tailorings CASCADE`,
  );
}

export interface TestUser {
  id: string;
  email: string;
  token: string;
  headers: { authorization: string };
}

let counter = 0;

export async function registerUser(
  app: FastifyInstance,
  overrides: { email?: string; name?: string; password?: string; timezone?: string } = {},
): Promise<TestUser> {
  counter += 1;
  const body = {
    email: overrides.email ?? `user${counter}-${Date.now()}@example.com`,
    name: overrides.name ?? `User ${counter}`,
    password: overrides.password ?? 'correct horse battery',
    ...(overrides.timezone ? { timezone: overrides.timezone } : {}),
  };
  const res = await app.inject({ method: 'POST', url: '/v1/auth/register', payload: body });
  if (res.statusCode !== 201) throw new Error(`register failed: ${res.statusCode} ${res.body}`);
  const json = res.json<{ user: { id: string; email: string }; token: string }>();
  return {
    id: json.user.id,
    email: json.user.email,
    token: json.token,
    headers: { authorization: `Bearer ${json.token}` },
  };
}

/** Injects a request as `user` and returns status + parsed JSON body. */
export async function call<T = any>(
  app: FastifyInstance,
  user: TestUser | null,
  method: InjectOptions['method'],
  url: string,
  payload?: unknown,
): Promise<{ status: number; body: T; headers: Record<string, unknown> }> {
  const res = await app.inject({
    method,
    url,
    headers: user ? user.headers : {},
    ...(payload !== undefined ? { payload: payload as InjectOptions['payload'] } : {}),
  });
  return {
    status: res.statusCode,
    body: (res.body ? res.json() : undefined) as T,
    headers: res.headers,
  };
}

export async function createApplication(
  app: FastifyInstance,
  user: TestUser,
  overrides: Record<string, unknown> = {},
) {
  const res = await call(app, user, 'POST', '/v1/applications', {
    company: 'Acme Corp',
    role: 'Backend Engineer',
    ...overrides,
  });
  if (res.status !== 201) throw new Error(`create failed: ${res.status} ${JSON.stringify(res.body)}`);
  return res.body as { id: string; stage: string; appliedOn: string | null } & Record<
    string,
    unknown
  >;
}
