import { describe, it, expect } from 'vitest';
import app from '../index';

describe('GET /health', () => {
  it('returns 200 with status ok', async () => {
    const env = { ENVIRONMENT: 'test' } as { ENVIRONMENT: string; SUPABASE_URL: string; SUPABASE_SERVICE_ROLE_KEY: string; SUPABASE_JWT_SECRET: string };
    const res = await app.request('/health', {}, env);
    expect(res.status).toBe(200);
    const body = await res.json() as { status: string; version: string };
    expect(body.status).toBe('ok');
    expect(body.version).toBe('0.0.1');
  });

  it('returns 404 for unknown routes', async () => {
    const env = { ENVIRONMENT: 'test' } as { ENVIRONMENT: string; SUPABASE_URL: string; SUPABASE_SERVICE_ROLE_KEY: string; SUPABASE_JWT_SECRET: string };
    const res = await app.request('/this-does-not-exist', {}, env);
    expect(res.status).toBe(404);
  });
});
