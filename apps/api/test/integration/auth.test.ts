import { describe, expect, it } from 'vitest';
import { SESSION_COOKIE } from '../../src/lib/auth.js';
import { call, registerUser, useTestApp } from '../helpers/app.js';

describe('auth and account', () => {
  const ctx = useTestApp();

  it('registers with a lower-cased email and signs the user in', async () => {
    const res = await ctx.app.inject({
      method: 'POST',
      url: '/v1/auth/register',
      payload: { email: '  Alex@Example.COM ', name: 'Alex', password: 'long enough pw' },
    });
    expect(res.statusCode).toBe(201);
    const body = res.json();
    expect(body.user).toMatchObject({
      email: 'alex@example.com',
      name: 'Alex',
      timezone: 'Asia/Singapore',
      isDemo: false,
    });
    expect(body.user).not.toHaveProperty('passwordHash');
    expect(body.token).toEqual(expect.any(String));

    const cookie = res.cookies.find((c) => c.name === SESSION_COOKIE);
    expect(cookie).toMatchObject({ httpOnly: true, sameSite: 'Lax', path: '/' });

    const me = await ctx.app.inject({
      method: 'GET',
      url: '/v1/me',
      cookies: { [SESSION_COOKIE]: cookie!.value },
    });
    expect(me.statusCode).toBe(200);
    expect(me.json().email).toBe('alex@example.com');
  });

  it('rejects duplicate emails case-insensitively', async () => {
    await registerUser(ctx.app, { email: 'dup@example.com' });
    const res = await call(ctx.app, null, 'POST', '/v1/auth/register', {
      email: 'DUP@example.com',
      name: 'Other',
      password: 'another password',
    });
    expect(res.status).toBe(409);
    expect(res.body.code).toBe('email_taken');
  });

  it('validates registration input with field-level errors', async () => {
    const res = await call(ctx.app, null, 'POST', '/v1/auth/register', {
      email: 'not-an-email',
      name: '',
      password: 'short',
      extra: true,
    });
    expect(res.status).toBe(400);
    expect(res.body.code).toBe('validation_failed');
    const paths = res.body.errors.map((e: { path: string }) => e.path);
    expect(paths).toEqual(
      expect.arrayContaining(['body.email', 'body.name', 'body.password']),
    );
  });

  it('logs in with correct credentials and refuses wrong ones identically', async () => {
    await registerUser(ctx.app, { email: 'login@example.com', password: 'my secret phrase' });

    const ok = await call(ctx.app, null, 'POST', '/v1/auth/login', {
      email: 'LOGIN@example.com',
      password: 'my secret phrase',
    });
    expect(ok.status).toBe(200);

    const wrongPassword = await call(ctx.app, null, 'POST', '/v1/auth/login', {
      email: 'login@example.com',
      password: 'wrong password',
    });
    const unknownEmail = await call(ctx.app, null, 'POST', '/v1/auth/login', {
      email: 'nobody@example.com',
      password: 'wrong password',
    });
    for (const res of [wrongPassword, unknownEmail]) {
      expect(res.status).toBe(401);
      expect(res.body.code).toBe('invalid_credentials');
      expect(res.body.detail).toBe('Email or password is incorrect');
    }
  });

  it('requires a session for protected routes', async () => {
    const none = await call(ctx.app, null, 'GET', '/v1/me');
    expect(none.status).toBe(401);
    expect(none.body.code).toBe('unauthorized');

    const bogus = await ctx.app.inject({
      method: 'GET',
      url: '/v1/me',
      headers: { authorization: 'Bearer not-a-real-token' },
    });
    expect(bogus.statusCode).toBe(401);
  });

  it('revokes the session on logout', async () => {
    const user = await registerUser(ctx.app);
    const logout = await call(ctx.app, user, 'POST', '/v1/auth/logout');
    expect(logout.status).toBe(204);
    const after = await call(ctx.app, user, 'GET', '/v1/me');
    expect(after.status).toBe(401);
  });

  it('expires sessions after 7 days of inactivity and slides expiry when used', async () => {
    const user = await registerUser(ctx.app);
    const start = ctx.clock.now.getTime();
    const day = 86_400_000;

    ctx.clock.now = new Date(start + 6 * day);
    expect((await call(ctx.app, user, 'GET', '/v1/me')).status).toBe(200); // extends expiry

    ctx.clock.now = new Date(start + 12 * day);
    expect((await call(ctx.app, user, 'GET', '/v1/me')).status).toBe(200);

    ctx.clock.now = new Date(start + 20 * day);
    expect((await call(ctx.app, user, 'GET', '/v1/me')).status).toBe(401);
  });

  it('updates the profile and validates the time zone', async () => {
    const user = await registerUser(ctx.app);
    const ok = await call(ctx.app, user, 'PATCH', '/v1/me', {
      name: 'New Name',
      timezone: 'Europe/London',
    });
    expect(ok.status).toBe(200);
    expect(ok.body).toMatchObject({ name: 'New Name', timezone: 'Europe/London' });

    const bad = await call(ctx.app, user, 'PATCH', '/v1/me', { timezone: 'Mars/Base' });
    expect(bad.status).toBe(400);
  });

  it('stores and returns the base resume', async () => {
    const user = await registerUser(ctx.app);
    expect((await call(ctx.app, user, 'GET', '/v1/me/resume')).body).toEqual({ text: null });
    const put = await call(ctx.app, user, 'PUT', '/v1/me/resume', { text: '  My resume  ' });
    expect(put.body).toEqual({ text: 'My resume' });
    const tooLong = await call(ctx.app, user, 'PUT', '/v1/me/resume', { text: 'x'.repeat(20_001) });
    expect(tooLong.status).toBe(400);
  });

  it('deletes the account and all its data', async () => {
    const user = await registerUser(ctx.app);
    await call(ctx.app, user, 'POST', '/v1/applications', { company: 'A', role: 'B' });
    expect((await call(ctx.app, user, 'DELETE', '/v1/me')).status).toBe(204);

    const { rows } = await ctx.database.pool.query(
      'SELECT (SELECT count(*) FROM users)::int AS users, (SELECT count(*) FROM applications)::int AS apps',
    );
    expect(rows[0]).toEqual({ users: 0, apps: 0 });
  });
});

describe('auth rate limiting', () => {
  const ctx = useTestApp({ rateLimit: true });

  it('throttles repeated sign-in attempts with problem details and Retry-After', async () => {
    const attempts = [];
    for (let i = 0; i < 11; i++) {
      attempts.push(
        await call(ctx.app, null, 'POST', '/v1/auth/login', {
          email: 'x@example.com',
          password: 'whatever pw',
        }),
      );
    }
    expect(attempts.slice(0, 10).every((r) => r.status === 401)).toBe(true);
    const limited = attempts[10]!;
    expect(limited.status).toBe(429);
    expect(limited.body.code).toBe('rate_limited');
    expect(limited.headers['retry-after']).toBeDefined();
  });
});
