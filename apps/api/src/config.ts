import { z } from 'zod';

const booleanString = z
  .enum(['true', 'false', '1', '0', ''])
  .default('false')
  .transform((v) => v === 'true' || v === '1');

const emptyToUndefined = (v: unknown) => (v === '' ? undefined : v);

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  HOST: z.string().default('0.0.0.0'),
  PORT: z.coerce.number().int().min(1).max(65535).default(3000),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).default('info'),
  DATABASE_URL: z.url({ protocol: /^postgres(ql)?$/ }),
  /** Direct (non-pooled) connection for migrations, e.g. Neon's URL without `-pooler`. */
  DATABASE_URL_UNPOOLED: z.preprocess(
    emptyToUndefined,
    z.url({ protocol: /^postgres(ql)?$/ }).optional(),
  ),
  COOKIE_SECURE: booleanString,
  ANTHROPIC_API_KEY: z.preprocess(emptyToUndefined, z.string().min(1).optional()),
  ANTHROPIC_MODEL: z.preprocess(emptyToUndefined, z.string().default('claude-opus-5-5')),
  AI_ALLOW_DEMO: booleanString,
  AI_DAILY_LIMIT: z.coerce.number().int().min(0).default(10),
  WEB_DIST_DIR: z.preprocess(emptyToUndefined, z.string().optional()),
  /** Apply pending migrations before listening (for hosts without a pre-deploy step). */
  MIGRATE_ON_START: booleanString,
});

export type Config = z.infer<typeof envSchema>;

/** Parses and validates configuration from the environment, failing fast with readable errors. */
export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const parsed = envSchema.safeParse(env);
  if (!parsed.success) {
    const details = parsed.error.issues
      .map((issue) => `  - ${issue.path.join('.')}: ${issue.message}`)
      .join('\n');
    throw new Error(`Invalid environment configuration:\n${details}`);
  }
  return parsed.data;
}
