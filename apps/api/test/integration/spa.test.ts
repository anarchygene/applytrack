import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { useTestApp } from '../helpers/app.js';

const webRoot = mkdtempSync(join(tmpdir(), 'applytrack-web-'));
mkdirSync(join(webRoot, 'assets'));
writeFileSync(join(webRoot, 'index.html'), '<!doctype html><div id="root"></div>');
writeFileSync(join(webRoot, 'assets', 'app-abc123.js'), 'console.log(1)');

describe('serving the built dashboard', () => {
  const ctx = useTestApp({ config: { WEB_DIST_DIR: webRoot } });

  it('serves index.html for client-side routes without caching', async () => {
    for (const url of ['/', '/applications', '/applications/123?tab=x']) {
      const res = await ctx.app.inject({ method: 'GET', url });
      expect(res.statusCode, url).toBe(200);
      expect(res.headers['content-type']).toContain('text/html');
      expect(res.headers['cache-control']).toBe('no-cache');
    }
  });

  it('serves hashed assets with long-lived caching', async () => {
    const res = await ctx.app.inject({ method: 'GET', url: '/assets/app-abc123.js' });
    expect(res.statusCode).toBe(200);
    expect(res.headers['cache-control']).toContain('immutable');
  });

  it('keeps unknown API routes and missing files as problem+json 404s', async () => {
    for (const url of ['/v1/unknown', '/assets/missing.js']) {
      const res = await ctx.app.inject({ method: 'GET', url });
      expect(res.statusCode, url).toBe(404);
      expect(res.json().code).toBe('not_found');
    }
    expect((await ctx.app.inject({ method: 'GET', url: '/health' })).statusCode).toBe(200);
  });
});
