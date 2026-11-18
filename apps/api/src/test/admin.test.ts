import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createFakeDb, fakeClient, makeJwt, TEST_ENV, type FakeDb } from './helpers/fake-supabase';

let db: FakeDb;
vi.mock('../lib/supabase', () => ({ getSupabaseAdmin: () => fakeClient(db) }));

const { app } = await import('../index');

const ADMIN = '11111111-1111-4111-8111-111111111111';
const LEARNER = '22222222-2222-4222-8222-222222222222';

async function get(path: string, user?: string) {
  const headers = new Headers();
  if (user) headers.set('Authorization', `Bearer ${await makeJwt(user)}`);
  const res = await app.request(path, { headers }, TEST_ENV);
  return { status: res.status, body: await res.json<Record<string, unknown>>() };
}

beforeEach(() => {
  const now = new Date().toISOString();
  const old = new Date(Date.now() - 60 * 86400 * 1000).toISOString();
  db = createFakeDb({
    tables: {
      profiles: [
        { id: ADMIN, google_email: 'a@x.test', full_name: 'Ada', role: 'admin', created_at: old, last_login_at: now },
        { id: LEARNER, google_email: 'l@x.test', full_name: 'Lee', role: 'learner', created_at: old, last_login_at: old },
      ],
      level_progress: [
        { user_id: ADMIN, level_id: 'p0-w01-py-001', status: 'passed', attempts: 2, hints_used: 1 },
        { user_id: LEARNER, level_id: 'p0-w01-py-001', status: 'in_progress', attempts: 4, hints_used: 3 },
        { user_id: LEARNER, level_id: 'p0-w01-py-002', status: 'unlocked', attempts: 0, hints_used: 0 },
      ],
      login_events: [{ user_id: ADMIN, created_at: now, country: 'IN', device_type: 'desktop' }],
      feedback: [{ id: 'f1', user_id: LEARNER, level_id: 'p0-w01-py-001', rating: 4, message: 'nice', created_at: now }],
    },
  });
});

describe('admin routes', () => {
  it('rejects anonymous (401) and non-admin (403) callers', async () => {
    expect((await get('/admin/overview')).status).toBe(401);
    expect((await get('/admin/overview', LEARNER)).status).toBe(403);
    expect((await get('/admin/analytics', LEARNER)).status).toBe(403);
  });

  it('returns the overview shape for an admin', async () => {
    const { status, body } = await get('/admin/overview', ADMIN);
    expect(status).toBe(200);
    const users = body.users as { total: number; active_7d: number; list: { email: string; levels_passed: number }[] };
    expect(users.total).toBe(2);
    expect(users.active_7d).toBe(1);
    expect(users.list.find((u) => u.email === 'a@x.test')?.levels_passed).toBe(1);
    expect((body.logins as { last_7d: number }).last_7d).toBe(1);
    const fb = body.feedback as { average_rating: number; items: unknown[] };
    expect(fb.items).toHaveLength(1);
    expect(fb.average_rating).toBe(4);
  });

  it('aggregates per-level analytics, ignoring never-attempted rows', async () => {
    const { status, body } = await get('/admin/analytics', ADMIN);
    expect(status).toBe(200);
    const levels = body.levels as Record<string, number | string>[];
    expect(levels).toHaveLength(1);
    expect(levels[0]).toMatchObject({ level_id: 'p0-w01-py-001', learners: 2, passed: 1, pass_rate: 0.5, avg_attempts: 3, avg_hints: 2, drop_off: 1, drop_off_rate: 0.5 });
  });
});
