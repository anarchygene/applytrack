import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { currentUser } from '../../lib/auth.js';
import { errorResponses, idParams, problemSchema, secured } from '../../lib/schemas.js';
import * as service from './service.js';

const tailoringSchema = z
  .object({
    id: z.uuid(),
    applicationId: z.uuid(),
    bullets: z.array(z.string()),
    missingKeywords: z.array(z.string()),
    summary: z.string(),
    model: z.string(),
    createdAt: z.string(),
  })
  .meta({ id: 'Tailoring' });

const statusSchema = z
  .object({
    available: z.boolean(),
    reason: z.string().nullable().describe('Why AI is unavailable, when it is'),
    model: z.string().nullable(),
    dailyLimit: z.number().int(),
    usedToday: z.number().int().describe('Requests in the last rolling 24 hours'),
  })
  .meta({ id: 'AiStatus' });

export const tailoringRoutes: FastifyPluginAsyncZod = async (app) => {
  app.addHook('onRequest', app.authenticate);
  const common = { tags: ['AI'], security: secured };

  app.get(
    '/ai/status',
    {
      schema: {
        ...common,
        summary: 'Whether AI tailoring is available, and usage against the daily limit',
        response: { 200: statusSchema, 401: problemSchema },
      },
    },
    async (request) => service.getStatus(app.deps, currentUser(request)),
  );

  app.get(
    '/applications/:id/tailorings',
    {
      schema: {
        ...common,
        summary: 'AI suggestions saved for an application, newest first',
        params: idParams,
        response: { 200: z.array(tailoringSchema), ...errorResponses },
      },
    },
    async (request) =>
      service.listForApplication(app.deps, currentUser(request), request.params.id),
  );

  app.post(
    '/applications/:id/tailorings',
    {
      config: { rateLimit: { max: 5, timeWindow: '1 minute' } },
      schema: {
        ...common,
        summary: 'Generate AI resume suggestions for an application',
        description:
          'Requires a saved resume and a job description on the application. Limited per user ' +
          'per rolling 24 hours. Failed provider calls do not count towards the limit.',
        params: idParams,
        response: {
          201: tailoringSchema,
          422: problemSchema,
          429: problemSchema,
          502: problemSchema,
          503: problemSchema,
          ...errorResponses,
        },
      },
    },
    async (request, reply) => {
      const result = await service.tailor(app.deps, currentUser(request), request.params.id);
      return reply.code(201).send(result);
    },
  );
};
