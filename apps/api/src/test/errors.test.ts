import { describe, expect, it, vi } from 'vitest';
import app from '../index';

const env = { ENVIRONMENT: 'test', SUPABASE_URL: 'http://localhost', SUPABASE_SERVICE_ROLE_KEY: 'x', SUPABASE_JWT_SECRET: 'x' };

function post(body: string) {
  return app.request('/errors', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body }, env);
}

describe('POST /errors', () => {
  it('accepts a valid report', async () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const res = await post(JSON.stringify({ message: 'boom', path: '/level/p0-w01-py-001', kind: 'error' }));
    expect(res.status).toBe(204);
    expect(spy).toHaveBeenCalled();
    spy.mockRestore();
  });

  it('rejects invalid JSON and query strings in the path', async () => {
    expect((await post('not json')).status).toBe(400);
    expect((await post(JSON.stringify({ message: 'x', path: '/a?email=me@example.com' }))).status).toBe(400);
  });

  it('rejects oversized reports', async () => {
    expect((await post(JSON.stringify({ message: 'x', stack: 'y'.repeat(9000) }))).status).toBe(413);
  });
});
