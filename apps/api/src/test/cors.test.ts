import { describe, expect, it } from 'vitest';
import { app } from '../index';

const base = { ENVIRONMENT: 'test', SUPABASE_URL: '', SUPABASE_SERVICE_ROLE_KEY: '' };
const preflight = (origin: string, env: Record<string, string>) =>
  app.request('/health', { method: 'OPTIONS', headers: { Origin: origin, 'Access-Control-Request-Method': 'GET' } }, env);

describe('CORS origins', () => {
  it('allows built-in origins', async () => {
    const res = await preflight('http://localhost:5173', base);
    expect(res.headers.get('access-control-allow-origin')).toBe('http://localhost:5173');
  });

  it('allows origins from ALLOWED_ORIGINS (trimmed, trailing slash ignored)', async () => {
    const env = { ...base, ALLOWED_ORIGINS: ' https://fde.vercel.app/ , https://fde.example.com' };
    expect((await preflight('https://fde.vercel.app', env)).headers.get('access-control-allow-origin')).toBe(
      'https://fde.vercel.app',
    );
    expect((await preflight('https://fde.example.com', env)).headers.get('access-control-allow-origin')).toBe(
      'https://fde.example.com',
    );
  });

  it('rejects other origins', async () => {
    const res = await preflight('https://evil.example', { ...base, ALLOWED_ORIGINS: 'https://fde.vercel.app' });
    expect(res.headers.get('access-control-allow-origin')).toBeNull();
  });
});
