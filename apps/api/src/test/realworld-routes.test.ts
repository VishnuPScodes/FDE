import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createFakeDb, fakeClient, makeJwt, rowsOf, TEST_ENV, type FakeDb } from './helpers/fake-supabase';
import { deriveSigningKey, sha256Hex, signPayload, verifyPayloadSignature, encryptSigningKey, decryptSigningKey } from '../lib/checker-crypto';

let db: FakeDb;
vi.mock('../lib/supabase', () => ({ getSupabaseAdmin: () => fakeClient(db) }));

const { app } = await import('../index');

const USER = '11111111-1111-4111-8111-111111111111';
const OTHER = '22222222-2222-4222-8222-222222222222';

async function call(path: string, init: RequestInit & { user?: string } = {}) {
  const headers = new Headers(init.headers);
  if (init.user) headers.set('Authorization', `Bearer ${await makeJwt(init.user)}`);
  if (init.body && !headers.has('content-type')) headers.set('content-type', 'application/json');
  const res = await app.request(path, { ...init, headers }, TEST_ENV);
  return { status: res.status, body: await res.json<Record<string, unknown>>(), headers: res.headers };
}

beforeEach(() => {
  db = createFakeDb({ unique: { realworld_runs: ['nonce'], checker_tokens: ['token_hash'] } });
});
afterEach(() => vi.unstubAllGlobals());

// ─── Checker crypto ───────────────────────────────────────────────────────────

describe('checker crypto', () => {
  it('derives the same signing key the Go CLI uses (known vector)', async () => {
    const key = await deriveSigningKey('fdec_test');
    const sig = await signPayload(key, '{"hello":"world"}');
    // Matches TestKnownVector in apps/checker/internal/checker/sign_test.go
    expect(sig).toBe(KNOWN_SIGNATURE);
  });
  it('round-trips the encrypted signing key and rejects a wrong secret', async () => {
    const key = await deriveSigningKey('fdec_abc');
    const stored = await encryptSigningKey(key, TEST_ENV.CHECKER_KEY_SECRET);
    expect(await decryptSigningKey(stored, TEST_ENV.CHECKER_KEY_SECRET)).toEqual(key);
    await expect(decryptSigningKey(stored, 'another-secret-that-is-long-enough-000000')).rejects.toBeDefined();
  });
  it('verifies signatures in constant-time compare and rejects tampering', async () => {
    const key = await deriveSigningKey('fdec_abc');
    const sig = await signPayload(key, 'payload');
    expect(await verifyPayloadSignature(key, 'payload', sig)).toBe(true);
    expect(await verifyPayloadSignature(key, 'payload!', sig)).toBe(false);
    expect(await verifyPayloadSignature(key, 'payload', sig.replace(/^./, (ch) => (ch === 'a' ? 'b' : 'a')))).toBe(false);
    expect(await verifyPayloadSignature(key, 'payload', 'zz')).toBe(false);
  });
});

// Computed independently with Python's hmac module; the Go CLI test uses the same vector.
const KNOWN_SIGNATURE = 'f4c85933f438ef8adce8b1f6c6a019eb7f73e432aa5ccf8d242277939b78fca5';

// ─── Checker routes ───────────────────────────────────────────────────────────

async function issueToken(user = USER): Promise<string> {
  const res = await call('/checker/token', { method: 'POST', user });
  expect(res.status).toBe(200);
  return res.body.token as string;
}

async function signedSubmission(token: string, overrides: Record<string, unknown> = {}) {
  const tokenId = await sha256Hex(token);
  const payload = JSON.stringify({
    v: 1,
    level_id: 'p2-w07-real-001',
    token_id: tokenId,
    timestamp: Math.floor(Date.now() / 1000),
    nonce: crypto.getRandomValues(new Uint8Array(16)).reduce((s, b) => s + b.toString(16).padStart(2, '0'), ''),
    checker_version: '0.1.0',
    results: [{ id: 'image-non-root', name: 'Image runs as non-root', passed: true, detail: 'user=app' }],
    ...overrides,
  });
  const signature = await signPayload(await deriveSigningKey(token), payload);
  return { token_id: tokenId, payload, signature };
}

describe('POST /checker/token', () => {
  it('requires auth', async () => {
    expect((await call('/checker/token', { method: 'POST' })).status).toBe(401);
  });
  it('issues a token and stores only its hash and an encrypted key', async () => {
    const token = await issueToken();
    expect(token).toMatch(/^fdec_[A-Za-z0-9_-]{43}$/);
    const row = rowsOf(db, 'checker_tokens')[0];
    expect(row).toMatchObject({ user_id: USER, token_hash: await sha256Hex(token) });
    expect(JSON.stringify(row)).not.toContain(token);
  });
  it('rotates: a new token replaces the old one', async () => {
    const first = await issueToken();
    const second = await issueToken();
    expect(rowsOf(db, 'checker_tokens')).toHaveLength(1);
    const res = await call('/checker/results', { method: 'POST', body: JSON.stringify(await signedSubmission(first)) });
    expect(res.status).toBe(401);
    expect((await call('/checker/results', { method: 'POST', body: JSON.stringify(await signedSubmission(second)) })).status).toBe(200);
  });
  it('returns 503 when the server secret is missing', async () => {
    const res = await app.request('/checker/token', { method: 'POST', headers: { Authorization: `Bearer ${await makeJwt(USER)}` } }, { ...TEST_ENV, CHECKER_KEY_SECRET: '' });
    expect(res.status).toBe(503);
  });
});

describe('POST /checker/results', () => {
  it('accepts a valid signed pass, records it and marks progress passed', async () => {
    const token = await issueToken();
    const res = await call('/checker/results', { method: 'POST', body: JSON.stringify(await signedSubmission(token)) });
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ ok: true, passed: true, level_id: 'p2-w07-real-001' });
    expect(rowsOf(db, 'realworld_runs')[0]).toMatchObject({ user_id: USER, source: 'checker', passed: true });
    expect(rowsOf(db, 'level_progress')[0]).toMatchObject({ user_id: USER, level_id: 'p2-w07-real-001', status: 'passed' });

    const status = await call('/checker/results/p2-w07-real-001', { user: USER });
    expect(status.body).toMatchObject({ found: true, passed: true });
    const other = await call('/checker/results/p2-w07-real-001', { user: OTHER });
    expect(other.body).toMatchObject({ found: false });
  });
  it('records a failing run without marking progress', async () => {
    const token = await issueToken();
    const res = await call('/checker/results', {
      method: 'POST',
      body: JSON.stringify(await signedSubmission(token, { results: [{ id: 'size', name: 'Image under 200 MB', passed: false, detail: '912 MB' }] })),
    });
    expect(res.body.passed).toBe(false);
    expect(rowsOf(db, 'level_progress')).toHaveLength(0);
  });
  it('rejects a tampered payload', async () => {
    const token = await issueToken();
    const sub = await signedSubmission(token, { results: [{ id: 'x', name: 'x', passed: false, detail: '' }] });
    sub.payload = sub.payload.replace('"passed":false', '"passed":true');
    expect((await call('/checker/results', { method: 'POST', body: JSON.stringify(sub) })).status).toBe(401);
  });
  it('rejects a signature made with a different token', async () => {
    const token = await issueToken();
    const sub = await signedSubmission(token);
    sub.signature = await signPayload(await deriveSigningKey('fdec_guess'), sub.payload);
    expect((await call('/checker/results', { method: 'POST', body: JSON.stringify(sub) })).status).toBe(401);
  });
  it('rejects unknown tokens', async () => {
    const res = await call('/checker/results', { method: 'POST', body: JSON.stringify(await signedSubmission('fdec_never_issued')) });
    expect(res.status).toBe(401);
  });
  it('rejects replays of the same nonce', async () => {
    const token = await issueToken();
    const sub = await signedSubmission(token);
    expect((await call('/checker/results', { method: 'POST', body: JSON.stringify(sub) })).status).toBe(200);
    expect((await call('/checker/results', { method: 'POST', body: JSON.stringify(sub) })).status).toBe(409);
  });
  it('rejects stale timestamps', async () => {
    const token = await issueToken();
    const sub = await signedSubmission(token, { timestamp: Math.floor(Date.now() / 1000) - 3600 });
    const res = await call('/checker/results', { method: 'POST', body: JSON.stringify(sub) });
    expect(res.status).toBe(401);
    expect(String(res.body.error)).toMatch(/clock/);
  });
  it('rejects payloads whose token_id differs from the envelope', async () => {
    const token = await issueToken();
    const sub = await signedSubmission(token, { token_id: 'a'.repeat(64) });
    expect((await call('/checker/results', { method: 'POST', body: JSON.stringify(sub) })).status).toBe(401);
  });
  it('rejects malformed bodies', async () => {
    expect((await call('/checker/results', { method: 'POST', body: '{"nope":1}' })).status).toBe(400);
  });
});

// ─── Live URL + GitHub checks ─────────────────────────────────────────────────

function stubNetwork(routes: Record<string, () => Response>, dns: Record<string, string[]> = { 'clinic-app.pages.dev': ['104.16.1.1'] }) {
  const seen: string[] = [];
  vi.stubGlobal('fetch', async (input: string | URL | Request) => {
    await Promise.resolve();
    const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
    seen.push(url);
    if (url.startsWith('https://cloudflare-dns.com/')) {
      const params = new URL(url).searchParams;
      const type = params.get('type');
      const ips = (dns[params.get('name') ?? ''] ?? []).filter((ip) => (type === 'AAAA') === ip.includes(':'));
      return new Response(JSON.stringify({ Status: 0, Answer: ips.map((data) => ({ type: type === 'AAAA' ? 28 : 1, data })) }));
    }
    for (const [prefix, handler] of Object.entries(routes)) if (url.startsWith(prefix)) return handler();
    return new Response('{"message":"Not Found"}', { status: 404 });
  });
  return seen;
}

describe('POST /checks/live-url', () => {
  it('passes status, contains and JSON path checks', async () => {
    stubNetwork({ 'https://clinic-app.pages.dev/health': () => new Response('{"status":"ok","clinic":"Pune"}', { headers: { 'content-type': 'application/json' } }) });
    const res = await call('/checks/live-url', {
      method: 'POST',
      user: USER,
      body: JSON.stringify({ url: 'https://clinic-app.pages.dev/health', level_id: 'p2-w07-real-003', contains: 'Pune', json_path: '$.status', json_equals: 'ok' }),
    });
    expect(res.status).toBe(200);
    expect(res.body.passed).toBe(true);
    expect(res.body.checks).toHaveLength(3);
    expect(rowsOf(db, 'realworld_runs')[0]).toMatchObject({ source: 'live_url', passed: true });
  });
  it('fails on wrong status with a useful actual value', async () => {
    stubNetwork({ 'https://clinic-app.pages.dev/': () => new Response('down', { status: 503 }) });
    const res = await call('/checks/live-url', { method: 'POST', user: USER, body: JSON.stringify({ url: 'https://clinic-app.pages.dev/' }) });
    expect(res.body.passed).toBe(false);
    expect((res.body.checks as { actual: string }[])[0]?.actual).toBe('503');
  });
  it('returns 422 for SSRF attempts without fetching the target', async () => {
    const seen = stubNetwork({});
    const res = await call('/checks/live-url', { method: 'POST', user: USER, body: JSON.stringify({ url: 'https://169.254.169.254/latest/meta-data/' }) });
    expect(res.status).toBe(422);
    expect(seen).toHaveLength(0);
  });
  it('requires auth', async () => {
    expect((await call('/checks/live-url', { method: 'POST', body: JSON.stringify({ url: 'https://clinic-app.pages.dev/' }) })).status).toBe(401);
  });
  it('rate limits to 20 checks per hour per user', async () => {
    stubNetwork({ 'https://clinic-app.pages.dev/': () => new Response('ok') });
    for (let i = 0; i < 20; i++) {
      expect((await call('/checks/live-url', { method: 'POST', user: USER, body: JSON.stringify({ url: 'https://clinic-app.pages.dev/' }) })).status).toBe(200);
    }
    const blocked = await call('/checks/live-url', { method: 'POST', user: USER, body: JSON.stringify({ url: 'https://clinic-app.pages.dev/' }) });
    expect(blocked.status).toBe(429);
    expect(blocked.headers.get('retry-after')).toBe('3600');
    expect((await call('/checks/live-url', { method: 'POST', user: OTHER, body: JSON.stringify({ url: 'https://clinic-app.pages.dev/' }) })).status).toBe(200);
  });
});

describe('POST /checks/github', () => {
  const repoJson = () => new Response(JSON.stringify({ private: false, full_name: 'priya-dev/clinic-api', default_branch: 'main' }));
  it('checks repo, file and latest workflow run', async () => {
    const seen = stubNetwork({
      'https://api.github.com/repos/priya-dev/clinic-api/contents/.github/workflows/ci.yml': () => new Response('{}'),
      'https://api.github.com/repos/priya-dev/clinic-api/actions/workflows/ci.yml/runs': () => new Response(JSON.stringify({ workflow_runs: [{ conclusion: 'success', name: 'CI' }] })),
      'https://api.github.com/repos/priya-dev/clinic-api': repoJson,
    });
    const res = await call('/checks/github', {
      method: 'POST',
      user: USER,
      body: JSON.stringify({ repo: 'https://github.com/priya-dev/clinic-api.git', file: '.github/workflows/ci.yml', workflow_success: true, workflow: 'ci.yml', level_id: 'p2-w07-real-002' }),
    });
    expect(res.status).toBe(200);
    expect(res.body.passed).toBe(true);
    expect(res.body.checks).toHaveLength(3);
    expect(seen.some((u) => u.includes('status=completed'))).toBe(true);
  });
  it('fails when the latest run failed', async () => {
    stubNetwork({
      'https://api.github.com/repos/priya-dev/clinic-api/actions/runs': () => new Response(JSON.stringify({ workflow_runs: [{ conclusion: 'failure' }] })),
      'https://api.github.com/repos/priya-dev/clinic-api': repoJson,
    });
    const res = await call('/checks/github', { method: 'POST', user: USER, body: JSON.stringify({ repo: 'priya-dev/clinic-api', workflow_success: true }) });
    expect(res.body.passed).toBe(false);
    expect((res.body.checks as { actual: string }[])[1]?.actual).toBe('failure');
  });
  it('reports missing repos', async () => {
    stubNetwork({});
    const res = await call('/checks/github', { method: 'POST', user: USER, body: JSON.stringify({ repo: 'priya-dev/missing' }) });
    expect(res.body.passed).toBe(false);
  });
  it('handles GitHub rate limiting gracefully', async () => {
    stubNetwork({ 'https://api.github.com/': () => new Response('{"message":"API rate limit exceeded"}', { status: 403, headers: { 'x-ratelimit-remaining': '0', 'x-ratelimit-reset': String(Math.floor(Date.now() / 1000) + 900) } }) });
    const res = await call('/checks/github', { method: 'POST', user: USER, body: JSON.stringify({ repo: 'priya-dev/clinic-api' }) });
    expect(res.status).toBe(503);
    expect(String(res.body.error)).toMatch(/limit/);
    expect(res.headers.get('retry-after')).toBeTruthy();
  });
  it('rejects bad repo names and path traversal', async () => {
    expect((await call('/checks/github', { method: 'POST', user: USER, body: JSON.stringify({ repo: '../../etc' }) })).status).toBe(422);
    expect((await call('/checks/github', { method: 'POST', user: USER, body: JSON.stringify({ repo: 'a/b', file: '../secrets' }) })).status).toBe(400);
  });
});

// ─── Usage pings ──────────────────────────────────────────────────────────────

describe('usage pings', () => {
  beforeEach(() => {
    db.rpcs.record_usage_ping = (args) => {
      const day = new Date().toISOString().slice(0, 10);
      if (!('usage_daily' in db.tables)) db.tables.usage_daily = [];
      const rows = db.tables.usage_daily;
      let row = rows.find((r) => r.app_key === args.p_app_key && r.day === day);
      if (!row) rows.push((row = { app_key: args.p_app_key, day, count: 0 }));
      if ((row.count as number) >= (args.p_limit as number)) return -1;
      row.count = (row.count as number) + 1;
      return row.count;
    };
  });

  it('creates a key, accepts pings and shows the owner a summary', async () => {
    const created = await call('/usage/keys', { method: 'POST', user: USER, body: JSON.stringify({ label: 'Kerala logistics tracker' }) });
    expect(created.status).toBe(201);
    const key = created.body.app_key as string;
    for (let i = 0; i < 3; i++) {
      const ping = await call('/usage/ping', { method: 'POST', body: JSON.stringify({ app_key: key }), headers: { 'content-type': 'text/plain' } });
      expect(ping.status).toBe(202);
    }
    const summary = await call(`/usage/${key}/summary`, { user: USER });
    expect(summary.status).toBe(200);
    expect(summary.body.total_30d).toBe(3);
    expect((await call(`/usage/${key}/summary`, { user: OTHER })).status).toBe(404);
  });
  it('rejects unknown keys and junk bodies', async () => {
    expect((await call('/usage/ping', { method: 'POST', body: JSON.stringify({ app_key: `fdeapp_${'a'.repeat(32)}` }) })).status).toBe(404);
    expect((await call('/usage/ping', { method: 'POST', body: 'hello' })).status).toBe(400);
  });
  it('enforces the daily limit per key', async () => {
    const key = (await call('/usage/keys', { method: 'POST', user: USER, body: '{}' })).body.app_key as string;
    db.tables.usage_daily = [{ app_key: key, day: new Date().toISOString().slice(0, 10), count: 1000 }];
    expect((await call('/usage/ping', { method: 'POST', body: JSON.stringify({ app_key: key }) })).status).toBe(429);
  });
  it('allows cross-origin pings', async () => {
    const res = await app.request('/usage/ping', { method: 'OPTIONS', headers: { Origin: 'https://kerala-logistics.pages.dev', 'Access-Control-Request-Method': 'POST' } }, TEST_ENV);
    expect(res.headers.get('access-control-allow-origin')).toBe('*');
  });
});
