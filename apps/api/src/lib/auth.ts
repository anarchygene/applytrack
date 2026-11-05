import { createHash, randomBytes } from 'node:crypto';
import type { FastifyReply, FastifyRequest } from 'fastify';
import fp from 'fastify-plugin';
import {
  extendSession,
  findActiveSession,
  insertSession,
} from '../modules/auth/repository.js';
import { AppError } from './errors.js';

export const SESSION_COOKIE = 'at_session';
export const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000;
/** Sliding expiry is refreshed at most this often per session, to avoid a write per request. */
const EXTEND_INTERVAL_MS = 60 * 60 * 1000;

export interface AuthUser {
  id: string;
  email: string;
  name: string;
  timezone: string;
  isDemo: boolean;
}

declare module 'fastify' {
  interface FastifyRequest {
    user: AuthUser | null;
    sessionId: string | null;
  }
  interface FastifyInstance {
    authenticate: (request: FastifyRequest) => Promise<void>;
  }
}

export function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

/** Creates a session row and returns the opaque token; only its hash is stored. */
export async function startSession(
  request: FastifyRequest,
  reply: FastifyReply,
  userId: string,
): Promise<string> {
  const { db, config, now } = request.server.deps;
  const token = randomBytes(32).toString('base64url');
  const expiresAt = new Date(now().getTime() + SESSION_TTL_MS);
  await insertSession(db, { id: hashToken(token), userId, expiresAt });
  reply.setCookie(SESSION_COOKIE, token, {
    path: '/',
    httpOnly: true,
    sameSite: 'lax',
    secure: config.COOKIE_SECURE,
    maxAge: SESSION_TTL_MS / 1000,
  });
  return token;
}

export function clearSessionCookie(reply: FastifyReply): void {
  reply.clearCookie(SESSION_COOKIE, { path: '/' });
}

function readToken(request: FastifyRequest): string | null {
  const header = request.headers.authorization;
  if (header?.startsWith('Bearer ')) return header.slice('Bearer '.length).trim() || null;
  return request.cookies[SESSION_COOKIE] ?? null;
}

export const authPlugin = fp(async (app) => {
  app.decorateRequest('user', null);
  app.decorateRequest('sessionId', null);

  app.decorate('authenticate', async (request: FastifyRequest) => {
    const token = readToken(request);
    if (!token) throw new AppError('unauthorized', 'Sign in required');

    const { db, now } = app.deps;
    const current = now();
    const id = hashToken(token);
    const found = await findActiveSession(db, id, current);
    if (!found) throw new AppError('unauthorized', 'Session is invalid or has expired');

    const remaining = found.session.expiresAt.getTime() - current.getTime();
    if (SESSION_TTL_MS - remaining > EXTEND_INTERVAL_MS) {
      await extendSession(db, id, new Date(current.getTime() + SESSION_TTL_MS));
    }

    const { user } = found;
    request.sessionId = id;
    request.user = {
      id: user.id,
      email: user.email,
      name: user.name,
      timezone: user.timezone,
      isDemo: user.isDemo,
    };
  });
});

/** Returns the authenticated user; use only in routes protected by `app.authenticate`. */
export function currentUser(request: FastifyRequest): AuthUser {
  if (!request.user) throw new AppError('unauthorized', 'Sign in required');
  return request.user;
}
