import { afterEach, describe, expect, it, vi } from 'vitest';
import * as entry from '../../api/index';

describe('Vercel entry (api/index.ts)', () => {
  afterEach(() => vi.unstubAllEnvs());

  it('serves the Hono app with settings from process.env', async () => {
    vi.stubEnv('ENVIRONMENT', 'production');
    const res = await entry.GET(new Request('https://api.example/health'));
    expect(res.status).toBe(200);
    expect((await res.json<{ environment: string }>()).environment).toBe('production');
  });

  it('applies ALLOWED_ORIGINS from process.env to CORS', async () => {
    vi.stubEnv('ALLOWED_ORIGINS', 'https://fde.vercel.app');
    const res = await entry.OPTIONS(
      new Request('https://api.example/health', {
        method: 'OPTIONS',
        headers: { Origin: 'https://fde.vercel.app', 'Access-Control-Request-Method': 'GET' },
      }),
    );
    expect(res.headers.get('access-control-allow-origin')).toBe('https://fde.vercel.app');
  });

  it('protects /cron/keep-alive with CRON_SECRET', async () => {
    vi.stubEnv('CRON_SECRET', 's3cret');
    vi.stubEnv('SUPABASE_URL', 'https://p.supabase.co');
    vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', 'k');
    const realFetch = globalThis.fetch;
    const pinged: string[] = [];
    globalThis.fetch = ((url: string) => {
      pinged.push(url);
      return Promise.resolve(new Response('[]'));
    }) as typeof fetch;
    try {
      expect((await entry.GET(new Request('https://api.example/cron/keep-alive'))).status).toBe(401);
      const ok = await entry.GET(
        new Request('https://api.example/cron/keep-alive', { headers: { Authorization: 'Bearer s3cret' } }),
      );
      expect(ok.status).toBe(200);
      expect(pinged).toEqual(['https://p.supabase.co/rest/v1/profiles?select=id&limit=1']);
    } finally {
      globalThis.fetch = realFetch;
    }
  });
});
