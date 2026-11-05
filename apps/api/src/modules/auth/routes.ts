import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { isValidTimeZone } from '../../domain/dates.js';
import { clearSessionCookie, currentUser, startSession } from '../../lib/auth.js';
import { problemSchema, secured, errorResponses, noContent } from '../../lib/schemas.js';
import { createDemoAccount } from './demo.js';
import { deleteSession, deleteUser } from './repository.js';
import * as service from './service.js';

const userSchema = z
  .object({
    id: z.uuid(),
    email: z.string(),
    name: z.string(),
    timezone: z.string(),
    isDemo: z.boolean(),
    createdAt: z.string(),
  })
  .meta({ id: 'User' });

const authResponse = z
  .object({
    user: userSchema,
    token: z.string().describe('Session token; also set as the httpOnly `at_session` cookie'),
  })
  .meta({ id: 'AuthResponse' });

const timezone = z
  .string()
  .max(64)
  .refine(isValidTimeZone, 'Must be an IANA time zone such as Asia/Singapore');

// Trim before validating so pasted addresses with stray spaces are accepted.
const email = z.string().trim().pipe(z.email().max(254));
const password = z.string().min(10, 'Must be at least 10 characters').max(200);
const name = z.string().trim().min(1).max(100);

const RESUME_MAX = 20_000;
const authLimit = { rateLimit: { max: 10, timeWindow: '1 minute' } };

export const authRoutes: FastifyPluginAsyncZod = async (app) => {
  const { db } = app.deps;

  app.post(
    '/auth/register',
    {
      config: authLimit,
      schema: {
        tags: ['Auth'],
        summary: 'Create an account and sign in',
        body: z.strictObject({ email, name, password, timezone: timezone.optional() }),
        response: { 201: authResponse, 409: problemSchema, 429: problemSchema, ...errorResponses },
      },
    },
    async (request, reply) => {
      const user = await service.register(db, request.body);
      const token = await startSession(request, reply, user.id);
      return reply.code(201).send({ user: service.toUserDto(user), token });
    },
  );

  app.post(
    '/auth/login',
    {
      config: authLimit,
      schema: {
        tags: ['Auth'],
        summary: 'Sign in with email and password',
        body: z.strictObject({ email: z.string().max(254), password: z.string().max(200) }),
        response: { 200: authResponse, 429: problemSchema, ...errorResponses },
      },
    },
    async (request, reply) => {
      const user = await service.login(db, request.body);
      const token = await startSession(request, reply, user.id);
      return { user: service.toUserDto(user), token };
    },
  );

  app.post(
    '/auth/demo',
    {
      config: { rateLimit: { max: 5, timeWindow: '1 hour' } },
      schema: {
        tags: ['Auth'],
        summary: 'Start a temporary demo account with sample data',
        description: 'Demo accounts and all their data are deleted automatically after 24 hours.',
        response: { 201: authResponse, 429: problemSchema },
      },
    },
    async (request, reply) => {
      const user = await createDemoAccount(db, app.deps.now());
      const token = await startSession(request, reply, user.id);
      return reply.code(201).send({ user: service.toUserDto(user), token });
    },
  );

  app.post(
    '/auth/logout',
    {
      onRequest: app.authenticate,
      schema: {
        tags: ['Auth'],
        summary: 'Sign out and revoke the current session',
        security: secured,
        response: { 204: noContent, 401: problemSchema },
      },
    },
    async (request, reply) => {
      if (request.sessionId) await deleteSession(db, request.sessionId);
      clearSessionCookie(reply);
      return reply.code(204).send();
    },
  );

  app.get(
    '/me',
    {
      onRequest: app.authenticate,
      schema: {
        tags: ['Auth'],
        summary: 'Get the signed-in user',
        security: secured,
        response: { 200: userSchema, 401: problemSchema },
      },
    },
    async (request) => service.toUserDto(await service.getUser(db, currentUser(request).id)),
  );

  app.patch(
    '/me',
    {
      onRequest: app.authenticate,
      schema: {
        tags: ['Auth'],
        summary: 'Update profile',
        security: secured,
        body: z.strictObject({ name: name.optional(), timezone: timezone.optional() }),
        response: { 200: userSchema, ...errorResponses },
      },
    },
    async (request) =>
      service.toUserDto(await service.updateProfile(db, currentUser(request).id, request.body)),
  );

  app.delete(
    '/me',
    {
      onRequest: app.authenticate,
      schema: {
        tags: ['Auth'],
        summary: 'Permanently delete the account and all of its data',
        security: secured,
        response: { 204: noContent, 401: problemSchema },
      },
    },
    async (request, reply) => {
      await deleteUser(db, currentUser(request).id);
      clearSessionCookie(reply);
      return reply.code(204).send();
    },
  );

  const resumeSchema = z.object({ text: z.string().nullable() }).meta({ id: 'Resume' });

  app.get(
    '/me/resume',
    {
      onRequest: app.authenticate,
      schema: {
        tags: ['AI'],
        summary: 'Get the base resume used for AI tailoring',
        security: secured,
        response: { 200: resumeSchema, 401: problemSchema },
      },
    },
    async (request) => {
      const user = await service.getUser(db, currentUser(request).id);
      return { text: user.resumeText };
    },
  );

  app.put(
    '/me/resume',
    {
      onRequest: app.authenticate,
      schema: {
        tags: ['AI'],
        summary: 'Save the base resume (plain text)',
        security: secured,
        body: z.strictObject({ text: z.string().max(RESUME_MAX) }),
        response: { 200: resumeSchema, ...errorResponses },
      },
    },
    async (request) => ({
      text: await service.setResume(db, currentUser(request).id, request.body.text),
    }),
  );
};
