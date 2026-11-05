import { describe, expect, it } from 'vitest';
import { useTestApp } from '../helpers/app.js';

type Operation = {
  summary?: string;
  security?: unknown[];
  responses: Record<string, { content?: Record<string, { schema?: unknown }> }>;
};

/** SC-006: every endpoint is documented with its request and response shapes. */
describe('OpenAPI document', () => {
  const ctx = useTestApp();

  it('documents every route with a summary, a success schema and auth requirements', async () => {
    const doc = (await ctx.app.inject({ method: 'GET', url: '/docs/openapi.json' })).json<{
      paths: Record<string, Record<string, Operation>>;
      components: { schemas: Record<string, unknown> };
    }>();

    const operations = Object.entries(doc.paths).flatMap(([path, methods]) =>
      Object.entries(methods).map(([method, op]) => ({ path, method, op })),
    );
    expect(operations.length).toBeGreaterThanOrEqual(25);

    const PUBLIC = new Set(['/v1/auth/register', '/v1/auth/login', '/v1/auth/demo', '/health', '/ready']);
    for (const { path, method, op } of operations) {
      const label = `${method.toUpperCase()} ${path}`;
      expect(op.summary, label).toBeTruthy();

      const success = Object.entries(op.responses).find(([code]) => code.startsWith('2'));
      expect(success, label).toBeDefined();
      if (success![0] !== '204') {
        expect(success![1].content?.['application/json']?.schema, label).toBeDefined();
      }

      if (PUBLIC.has(path)) expect(op.security, label).toBeUndefined();
      else expect(op.security, label).toEqual([{ cookieAuth: [] }, { bearerAuth: [] }]);
    }

    expect(Object.keys(doc.components.schemas)).toEqual(
      expect.arrayContaining(['Application', 'ApplicationSummary', 'Problem', 'Stats', 'User']),
    );
  });
});
