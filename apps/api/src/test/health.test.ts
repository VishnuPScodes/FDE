import { describe, it, expect } from 'vitest';
import { app } from '../index';

describe('GET /health', () => {
  it('returns 200 with status ok', async () => {
    const env = { ENVIRONMENT: "test", SUPABASE_URL: "", SUPABASE_SERVICE_ROLE_KEY: "", SUPABASE_JWT_SECRET: "" };
    const res = await app.request('/health', {}, env);
    expect(res.status).toBe(200);
    const body = await res.json<{ status: string; version: string }>();
    expect(body.status).toBe('ok');
    expect(body.version).toBe('0.0.1');
  });

  it('returns 404 for unknown routes', async () => {
    const env = { ENVIRONMENT: "test", SUPABASE_URL: "", SUPABASE_SERVICE_ROLE_KEY: "", SUPABASE_JWT_SECRET: "" };
    const res = await app.request('/this-does-not-exist', {}, env);
    expect(res.status).toBe(404);
  });
});

describe('scheduled keep-alive', () => {
  it('pings Supabase with the service key', async () => {
    const { default: worker } = await import('../index');
    const calls: [string, RequestInit | undefined][] = [];
    const realFetch = globalThis.fetch;
    globalThis.fetch = ((url: string, init?: RequestInit) => {
      calls.push([url, init]);
      return Promise.resolve(new Response('[]', { status: 200 }));
    }) as typeof fetch;
    try {
      const pending: Promise<unknown>[] = [];
      worker.scheduled(
        {} as ScheduledController,
        { ENVIRONMENT: 'test', SUPABASE_URL: 'https://p.supabase.co', SUPABASE_SERVICE_ROLE_KEY: 'k' },
        { waitUntil: (p: Promise<unknown>) => pending.push(p), passThroughOnException: () => {} } as unknown as ExecutionContext,
      );
      await Promise.all(pending);
      expect(calls[0]?.[0]).toBe('https://p.supabase.co/rest/v1/profiles?select=id&limit=1');
    } finally {
      globalThis.fetch = realFetch;
    }
  });
});
