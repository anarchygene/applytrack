import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { currentUser } from '../../lib/auth.js';
import { problemSchema, secured, sourceSchema } from '../../lib/schemas.js';
import * as service from './service.js';

const count = z.number().int();
const ratio = z.number().min(0).max(1).nullable();

const statsSchema = z
  .object({
    totals: z.object({ all: count, submitted: count, responded: count, offers: count }),
    byStage: z.object({
      wishlist: count,
      applied: count,
      screening: count,
      interviewing: count,
      offer: count,
      accepted: count,
      rejected: count,
      withdrawn: count,
    }),
    responseRate: ratio.describe('Share of submitted applications that reached screening or later'),
    offerRate: ratio.describe('Share of submitted applications that reached an offer'),
    avgDaysToFirstResponse: z.number().nullable(),
    weekly: z
      .array(z.object({ weekStart: z.string(), count }))
      .describe('Submissions per ISO week, 12 weeks, oldest first'),
    bySource: z.array(
      z.object({
        source: z.union([sourceSchema, z.literal('unknown')]),
        submitted: count,
        responded: count,
        responseRate: ratio,
      }),
    ),
  })
  .meta({
    id: 'Stats',
    description: 'Null rates mean there is not enough data (no submitted applications).',
  });

export const statsRoutes: FastifyPluginAsyncZod = async (app) => {
  const { db, now } = app.deps;

  app.get(
    '/stats',
    {
      onRequest: app.authenticate,
      schema: {
        tags: ['Stats'],
        summary: 'Job search statistics',
        security: secured,
        response: { 200: statsSchema, 401: problemSchema },
      },
    },
    async (request) => service.getStats(db, currentUser(request), now()),
  );
};
