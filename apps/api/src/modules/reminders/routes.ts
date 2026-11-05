import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { currentUser } from '../../lib/auth.js';
import { errorResponses, idParams, isoDate, noContent, secured } from '../../lib/schemas.js';
import * as service from './service.js';

const reminderSchema = z
  .object({
    id: z.uuid(),
    applicationId: z.uuid(),
    application: z.object({ company: z.string(), role: z.string() }),
    title: z.string(),
    dueOn: z.string(),
    completedAt: z.string().nullable(),
    isAuto: z.boolean(),
    createdAt: z.string(),
  })
  .meta({ id: 'Reminder' });

const reminderListSchema = z
  .object({
    today: z.string().describe("Today's date in the user's time zone"),
    overdue: z.array(reminderSchema),
    dueToday: z.array(reminderSchema),
    upcoming: z.array(reminderSchema),
    completed: z.array(reminderSchema).describe('Empty unless includeCompleted=true'),
  })
  .meta({ id: 'ReminderList' });

const title = z.string().trim().min(1).max(200);

export const reminderRoutes: FastifyPluginAsyncZod = async (app) => {
  const { db, now } = app.deps;
  app.addHook('onRequest', app.authenticate);
  const common = { tags: ['Reminders'], security: secured };

  app.get(
    '/reminders',
    {
      schema: {
        ...common,
        summary: 'Reminders grouped as overdue, due today and upcoming',
        querystring: z.strictObject({
          includeCompleted: z
            .enum(['true', 'false'])
            .default('false')
            .transform((v) => v === 'true'),
          applicationId: z.uuid().optional(),
        }),
        response: { 200: reminderListSchema, ...errorResponses },
      },
    },
    async (request) =>
      service.listReminders(db, currentUser(request), request.query, now()),
  );

  app.post(
    '/applications/:id/reminders',
    {
      schema: {
        ...common,
        summary: 'Add a reminder to an application',
        params: idParams,
        body: z.strictObject({ title, dueOn: isoDate }),
        response: { 201: reminderSchema, ...errorResponses },
      },
    },
    async (request, reply) => {
      const reminder = await service.createReminder(
        db,
        currentUser(request),
        request.params.id,
        request.body,
      );
      return reply.code(201).send(reminder);
    },
  );

  app.patch(
    '/reminders/:id',
    {
      schema: {
        ...common,
        summary: 'Edit, complete or reopen a reminder',
        params: idParams,
        body: z.strictObject({
          title: title.optional(),
          dueOn: isoDate.optional(),
          completed: z.boolean().optional(),
        }),
        response: { 200: reminderSchema, ...errorResponses },
      },
    },
    async (request) =>
      service.updateReminder(db, currentUser(request), request.params.id, request.body, now()),
  );

  app.delete(
    '/reminders/:id',
    {
      schema: {
        ...common,
        summary: 'Delete a reminder',
        params: idParams,
        response: { 204: noContent, ...errorResponses },
      },
    },
    async (request, reply) => {
      await service.deleteReminder(db, currentUser(request), request.params.id);
      return reply.code(204).send();
    },
  );
};
