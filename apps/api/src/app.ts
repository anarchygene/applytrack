import { randomUUID } from 'node:crypto';
import { resolve } from 'node:path';
import cookie from '@fastify/cookie';
import helmet from '@fastify/helmet';
import rateLimit from '@fastify/rate-limit';
import fastifyStatic from '@fastify/static';
import swagger from '@fastify/swagger';
import scalar from '@scalar/fastify-api-reference';
import Fastify, { type FastifyError, type FastifyInstance, type FastifyServerOptions } from 'fastify';
import {
  hasZodFastifySchemaValidationErrors,
  isResponseSerializationError,
  jsonSchemaTransform,
  jsonSchemaTransformObject,
  serializerCompiler,
  validatorCompiler,
  type ZodTypeProvider,
} from 'fastify-type-provider-zod';
import type pg from 'pg';
import { z } from 'zod';
import type { Config } from './config.js';
import type { Db } from './db/client.js';
import { authPlugin } from './lib/auth.js';
import { AppError } from './lib/errors.js';
import { problemSchema } from './lib/schemas.js';
import { applicationRoutes } from './modules/applications/routes.js';
import { authRoutes } from './modules/auth/routes.js';
import { reminderRoutes } from './modules/reminders/routes.js';
import { statsRoutes } from './modules/stats/routes.js';
import type { TailoringProvider } from './modules/tailoring/provider.js';
import { tailoringRoutes } from './modules/tailoring/routes.js';

export interface AppDeps {
  config: Config;
  db: Db;
  pool: pg.Pool;
  /** `null` when no AI provider is configured (feature disabled). */
  tailoring: TailoringProvider | null;
  now: () => Date;
  /** Disable rate limiting (tests that are not about rate limiting). */
  rateLimitDisabled?: boolean;
}

declare module 'fastify' {
  interface FastifyInstance {
    deps: AppDeps;
  }
}

export const API_VERSION = '1.0.0';

const STRICT_CSP = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data:",
  "font-src 'self' data:",
  "connect-src 'self'",
  "object-src 'none'",
  "base-uri 'self'",
  "frame-ancestors 'none'",
  "form-action 'self'",
].join('; ');

function loggerOptions(config: Config): FastifyServerOptions['logger'] {
  if (config.LOG_LEVEL === 'silent') return false;
  return {
    level: config.LOG_LEVEL,
    redact: {
      paths: [
        'req.headers.authorization',
        'req.headers.cookie',
        'res.headers["set-cookie"]',
        '*.password',
        '*.text',
        '*.resumeText',
      ],
      censor: '[redacted]',
    },
    ...(config.NODE_ENV === 'development'
      ? { transport: { target: 'pino-pretty', options: { translateTime: 'SYS:HH:MM:ss' } } }
      : {}),
  };
}

export async function buildApp(deps: AppDeps): Promise<FastifyInstance> {
  const { config } = deps;
  const app = Fastify({
    logger: loggerOptions(config),
    trustProxy: true,
    genReqId: (req) => {
      const incoming = req.headers['x-request-id'];
      return typeof incoming === 'string' && /^[\w-]{1,64}$/.test(incoming)
        ? incoming
        : randomUUID();
    },
    ajv: { customOptions: { removeAdditional: false } },
  }).withTypeProvider<ZodTypeProvider>();

  app.decorate('deps', deps);
  app.setValidatorCompiler(validatorCompiler);
  app.setSerializerCompiler(serializerCompiler);

  app.addHook('onRequest', async (request, reply) => {
    reply.header('x-request-id', request.id);
    if (!request.url.startsWith('/docs')) reply.header('content-security-policy', STRICT_CSP);
  });

  app.setErrorHandler((error: FastifyError, request, reply) => {
    const problem = toAppError(error, request.log).toProblem(request.id);
    if (problem.retryAfterSeconds !== undefined) {
      reply.header('retry-after', String(problem.retryAfterSeconds));
    }
    return reply.code(problem.status).type('application/problem+json').send(problem);
  });

  await app.register(helmet, { contentSecurityPolicy: false });
  await app.register(cookie);
  await app.register(rateLimit, {
    global: true,
    max: 300,
    timeWindow: '1 minute',
    allowList: () => deps.rateLimitDisabled === true,
    errorResponseBuilder: (_request, context) =>
      new AppError('rate_limited', 'Too many requests, please slow down', {
        retryAfterSeconds: Math.ceil(context.ttl / 1000),
      }),
  });

  await app.register(swagger, {
    openapi: {
      openapi: '3.1.0',
      info: {
        title: 'ApplyTrack API',
        version: API_VERSION,
        description:
          'Track job applications through a hiring pipeline, with reminders, statistics and ' +
          'optional AI resume tailoring. Authenticate with the `at_session` cookie set by ' +
          '`/v1/auth/login`, or send the returned token as `Authorization: Bearer <token>`. ' +
          'Errors use RFC 9457 `application/problem+json` with a stable `code`.',
      },
      tags: [
        { name: 'Auth', description: 'Registration, sessions and account' },
        { name: 'Applications', description: 'Job applications and the hiring pipeline' },
        { name: 'Reminders', description: 'Follow-ups and to-dos' },
        { name: 'Stats', description: 'Job search statistics' },
        { name: 'AI', description: 'Optional AI resume tailoring' },
        { name: 'Platform', description: 'Health and readiness' },
      ],
      components: {
        securitySchemes: {
          cookieAuth: { type: 'apiKey', in: 'cookie', name: 'at_session' },
          bearerAuth: { type: 'http', scheme: 'bearer' },
        },
      },
    },
    transform: jsonSchemaTransform,
    transformObject: jsonSchemaTransformObject,
  });
  await app.register(scalar, {
    routePrefix: '/docs',
    configuration: { theme: 'purple', metaData: { title: 'ApplyTrack API Reference' } },
  });

  await app.register(authPlugin);

  const healthSchema = { 200: z.object({ status: z.literal('ok') }), 503: problemSchema };
  app.get(
    '/health',
    { schema: { tags: ['Platform'], summary: 'Liveness check', response: healthSchema } },
    async () => ({ status: 'ok' as const }),
  );
  app.get(
    '/ready',
    {
      schema: {
        tags: ['Platform'],
        summary: 'Readiness check (verifies the database)',
        response: healthSchema,
      },
    },
    async (request) => {
      try {
        await deps.pool.query('SELECT 1');
      } catch (error) {
        request.log.error({ err: error }, 'readiness check failed');
        throw new AppError('not_ready', 'Database is unreachable');
      }
      return { status: 'ok' as const };
    },
  );

  await app.register(
    async (v1) => {
      await v1.register(authRoutes);
      await v1.register(applicationRoutes);
      await v1.register(reminderRoutes);
      await v1.register(statsRoutes);
      await v1.register(tailoringRoutes);
    },
    { prefix: '/v1' },
  );

  const webRoot = config.WEB_DIST_DIR ? resolve(config.WEB_DIST_DIR) : null;
  if (webRoot) {
    // Built files get a route each; hashed assets are cached forever, index.html never.
    await app.register(fastifyStatic, {
      root: webRoot,
      wildcard: false,
      index: false,
      setHeaders: (res, filePath) => {
        res.header(
          'cache-control',
          filePath.endsWith('.html') ? 'no-cache' : 'public, max-age=31536000, immutable',
        );
      },
    });
    // History-API fallback for client-side routes. API, docs and missing files stay 404s.
    app.get('/*', { schema: { hide: true } }, async (request, reply) => {
      const path = request.url.split('?')[0] ?? '/';
      if (/^\/(v1|docs)(\/|$)/.test(path) || /\.[a-z0-9]+$/i.test(path)) {
        throw new AppError('not_found', `Route ${request.method} ${path} not found`);
      }
      return reply.header('cache-control', 'no-cache').sendFile('index.html');
    });
  }

  app.setNotFoundHandler((request) => {
    throw new AppError('not_found', `Route ${request.method} ${request.url.split('?')[0]} not found`);
  });

  return app;
}

function toAppError(error: FastifyError, log: FastifyInstance['log']): AppError {
  if (error instanceof AppError) return error;

  if (hasZodFastifySchemaValidationErrors(error)) {
    const where = error.validationContext ?? 'request';
    return new AppError('validation_failed', 'Request validation failed', {
      errors: error.validation.map((issue) => ({
        path: `${where}${issue.instancePath.replaceAll('/', '.')}`,
        message: issue.message ?? 'Invalid value',
      })),
    });
  }

  if (isResponseSerializationError(error)) {
    log.error({ err: error, issues: error.cause.issues }, 'response did not match its schema');
    return new AppError('internal_error', 'An unexpected error occurred');
  }

  const status = error.statusCode ?? 500;
  if (status === 404) return new AppError('not_found', error.message);
  if (status === 429) return new AppError('rate_limited', 'Too many requests, please slow down');
  if (status >= 400 && status < 500) return new AppError('validation_failed', error.message);

  log.error({ err: error }, 'unhandled error');
  return new AppError('internal_error', 'An unexpected error occurred');
}
