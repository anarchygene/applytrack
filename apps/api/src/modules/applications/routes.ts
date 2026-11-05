import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { currentUser } from '../../lib/auth.js';
import {
  errorResponses,
  idParams,
  noContent,
  pageOf,
  problemSchema,
  secured,
} from '../../lib/schemas.js';
import {
  applicationCreateBody,
  applicationSchema,
  applicationSummarySchema,
  applicationUpdateBody,
  listQuery,
  stageChangeBody,
  stageEventSchema,
} from './schemas.js';
import * as service from './service.js';

export const applicationRoutes: FastifyPluginAsyncZod = async (app) => {
  const { db, now } = app.deps;
  app.addHook('onRequest', app.authenticate);
  const common = { tags: ['Applications'], security: secured };

  app.get(
    '/applications',
    {
      schema: {
        ...common,
        summary: 'List, search and filter applications',
        querystring: listQuery,
        response: { 200: pageOf(applicationSummarySchema), ...errorResponses },
      },
    },
    async (request) => service.listApplications(db, currentUser(request), request.query),
  );

  app.post(
    '/applications',
    {
      schema: {
        ...common,
        summary: 'Create an application',
        body: applicationCreateBody,
        response: { 201: applicationSchema, ...errorResponses },
      },
    },
    async (request, reply) => {
      const row = await service.createApplication(db, currentUser(request), request.body, now());
      return reply.code(201).send(service.toApplicationDto(row));
    },
  );

  app.get(
    '/applications/:id',
    {
      schema: {
        ...common,
        summary: 'Get an application',
        params: idParams,
        response: { 200: applicationSchema, ...errorResponses },
      },
    },
    async (request) =>
      service.toApplicationDto(
        await service.getApplication(db, currentUser(request), request.params.id),
      ),
  );

  app.patch(
    '/applications/:id',
    {
      schema: {
        ...common,
        summary: 'Update application details',
        description: 'Use `POST /v1/applications/{id}/stage` to change the stage.',
        params: idParams,
        body: applicationUpdateBody,
        response: { 200: applicationSchema, ...errorResponses },
      },
    },
    async (request) =>
      service.toApplicationDto(
        await service.updateApplication(db, currentUser(request), request.params.id, request.body),
      ),
  );

  app.delete(
    '/applications/:id',
    {
      schema: {
        ...common,
        summary: 'Delete an application with its timeline, reminders and AI suggestions',
        params: idParams,
        response: { 204: noContent, ...errorResponses },
      },
    },
    async (request, reply) => {
      await service.deleteApplication(db, currentUser(request), request.params.id);
      return reply.code(204).send();
    },
  );

  app.post(
    '/applications/:id/stage',
    {
      schema: {
        ...common,
        summary: 'Move an application to another pipeline stage',
        description:
          'Records a timeline event. Closed stages (accepted, rejected, withdrawn) can only be ' +
          'reopened to `applied`. The first move to a submitted stage sets `appliedOn`; the first ' +
          'move to `applied` also creates a follow-up reminder 7 days later.',
        params: idParams,
        body: stageChangeBody,
        response: { 200: applicationSchema, 409: problemSchema, ...errorResponses },
      },
    },
    async (request) =>
      service.toApplicationDto(
        await service.changeStage(db, currentUser(request), request.params.id, request.body, now()),
      ),
  );

  app.get(
    '/applications/:id/timeline',
    {
      schema: {
        ...common,
        summary: 'Stage history of an application, oldest first',
        params: idParams,
        response: { 200: z.array(stageEventSchema), ...errorResponses },
      },
    },
    async (request) => service.getTimeline(db, currentUser(request), request.params.id),
  );
};
