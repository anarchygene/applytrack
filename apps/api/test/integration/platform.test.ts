import { describe, expect, it } from 'vitest';
import { useTestApp } from '../helpers/app.js';

describe('platform', () => {
  const ctx = useTestApp();

  it('reports liveness and readiness', async () => {
    const health = await ctx.app.inject({ method: 'GET', url: '/health' });
    expect(health.statusCode).toBe(200);
    expect(health.json()).toEqual({ status: 'ok' });

    const ready = await ctx.app.inject({ method: 'GET', url: '/ready' });
    expect(ready.statusCode).toBe(200);
  });

  it('echoes a safe incoming request id and generates one otherwise', async () => {
    const withId = await ctx.app.inject({
      method: 'GET',
      url: '/health',
      headers: { 'x-request-id': 'trace-123' },
    });
    expect(withId.headers['x-request-id']).toBe('trace-123');

    const generated = await ctx.app.inject({ method: 'GET', url: '/health' });
    expect(generated.headers['x-request-id']).toMatch(/^[0-9a-f-]{36}$/);
  });

  it('sets security headers', async () => {
    const res = await ctx.app.inject({ method: 'GET', url: '/health' });
    expect(res.headers['x-content-type-options']).toBe('nosniff');
    expect(res.headers['content-security-policy']).toContain("default-src 'self'");
  });

  it('returns RFC 9457 problem details for unknown routes', async () => {
    const res = await ctx.app.inject({ method: 'GET', url: '/v1/nope' });
    expect(res.statusCode).toBe(404);
    expect(res.headers['content-type']).toContain('application/problem+json');
    expect(res.json()).toMatchObject({
      type: 'about:blank',
      title: 'Not Found',
      status: 404,
      code: 'not_found',
      requestId: expect.any(String),
    });
  });

  it('serves the OpenAPI document and the reference UI', async () => {
    const doc = await ctx.app.inject({ method: 'GET', url: '/docs/openapi.json' });
    expect(doc.statusCode).toBe(200);
    expect(doc.json()).toMatchObject({ openapi: '3.1.0', info: { title: 'ApplyTrack API' } });

    const ui = await ctx.app.inject({ method: 'GET', url: '/docs' });
    expect([200, 302]).toContain(ui.statusCode);
  });
});
