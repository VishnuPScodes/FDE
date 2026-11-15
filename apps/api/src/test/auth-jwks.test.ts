import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { authMiddleware, _resetJwksCache } from '../middleware/auth';

const SUPABASE_URL = 'https://proj.supabase.co';
const ISS = `${SUPABASE_URL}/auth/v1`;

function b64url(input: ArrayBuffer | Uint8Array | string): string {
  const bytes =
    typeof input === 'string' ? new TextEncoder().encode(input) : new Uint8Array(input as ArrayBuffer);
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

async function makeEcKey(kid: string) {
  const pair = (await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, [
    'sign',
    'verify',
  ])) as CryptoKeyPair;
  const exported = (await crypto.subtle.exportKey('jwk', pair.publicKey)) as JsonWebKey;
  const jwk = Object.assign({}, exported, { kid, alg: 'ES256', use: 'sig' });
  return { privateKey: pair.privateKey, jwk };
}

async function signEs256(privateKey: CryptoKey, kid: string, payload: Record<string, unknown>) {
  const head = b64url(JSON.stringify({ alg: 'ES256', typ: 'JWT', kid }));
  const body = b64url(JSON.stringify(payload));
  const sig = await crypto.subtle.sign(
    { name: 'ECDSA', hash: 'SHA-256' },
    privateKey,
    new TextEncoder().encode(`${head}.${body}`),
  );
  return `${head}.${body}.${b64url(sig)}`;
}

async function run(token: string, env: Record<string, string | undefined>) {
  let status = 200;
  let body: unknown = null;
  const vars: Record<string, string> = {};
  let nextCalled = false;
  const c = {
    req: { header: (n: string) => (n === 'Authorization' ? `Bearer ${token}` : undefined) },
    env,
    json: (b: unknown, s?: number) => {
      body = b;
      status = s ?? 200;
      return new Response(JSON.stringify(b), { status });
    },
    set: (k: string, v: string) => {
      vars[k] = v;
    },
    get: (k: string) => vars[k],
  };
  await authMiddleware(c as unknown as Parameters<typeof authMiddleware>[0], () => {
    nextCalled = true;
    return Promise.resolve();
  });
  return { status, body, vars, nextCalled };
}

const future = () => Math.floor(Date.now() / 1000) + 3600;

describe('JWT auth middleware: asymmetric (JWKS) keys', () => {
  let keys: JsonWebKey[];
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    _resetJwksCache();
    keys = [];
    fetchMock = vi.fn((url: string) => {
      expect(url).toBe(`${ISS}/.well-known/jwks.json`);
      return Promise.resolve(new Response(JSON.stringify({ keys }), { status: 200 }));
    });
    vi.stubGlobal('fetch', fetchMock);
  });
  afterEach(() => vi.unstubAllGlobals());

  it('accepts a valid ES256 token without SUPABASE_JWT_SECRET', async () => {
    const k = await makeEcKey('k1');
    keys.push(k.jwk);
    const token = await signEs256(k.privateKey, 'k1', {
      sub: 'user-1',
      email: 'a@b.c',
      role: 'authenticated',
      iss: ISS,
      exp: future(),
    });
    const r = await run(token, { SUPABASE_URL: SUPABASE_URL });
    expect(r.status).toBe(200);
    expect(r.nextCalled).toBe(true);
    expect(r.vars.userId).toBe('user-1');
    expect(r.vars.userEmail).toBe('a@b.c');
  });

  it('caches the JWKS across requests', async () => {
    const k = await makeEcKey('k1');
    keys.push(k.jwk);
    const token = await signEs256(k.privateKey, 'k1', { sub: 'u', iss: ISS, exp: future() });
    await run(token, { SUPABASE_URL });
    await run(token, { SUPABASE_URL });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('rejects a tampered payload', async () => {
    const k = await makeEcKey('k1');
    keys.push(k.jwk);
    const token = await signEs256(k.privateKey, 'k1', { sub: 'user-1', iss: ISS, exp: future() });
    const [h, , s] = token.split('.');
    const forged = `${h}.${b64url(JSON.stringify({ sub: 'admin', iss: ISS, exp: future() }))}.${s}`;
    const r = await run(forged, { SUPABASE_URL });
    expect(r.status).toBe(401);
    expect(r.nextCalled).toBe(false);
  });

  it('rejects a token signed by a key not in the JWKS', async () => {
    const published = await makeEcKey('k1');
    const attacker = await makeEcKey('k1');
    keys.push(published.jwk);
    const token = await signEs256(attacker.privateKey, 'k1', { sub: 'u', iss: ISS, exp: future() });
    expect((await run(token, { SUPABASE_URL })).status).toBe(401);
  });

  it('rejects a token from another project (issuer mismatch)', async () => {
    const k = await makeEcKey('k1');
    keys.push(k.jwk);
    const token = await signEs256(k.privateKey, 'k1', {
      sub: 'u',
      iss: 'https://other.supabase.co/auth/v1',
      exp: future(),
    });
    expect((await run(token, { SUPABASE_URL })).status).toBe(401);
  });

  it('rejects an expired token', async () => {
    const k = await makeEcKey('k1');
    keys.push(k.jwk);
    const token = await signEs256(k.privateKey, 'k1', { sub: 'u', iss: ISS, exp: 1 });
    const r = await run(token, { SUPABASE_URL });
    expect(r.status).toBe(401);
    expect((r.body as { error: string }).error).toContain('expired');
  });

  it('refetches the JWKS when a new kid appears (key rotation)', async () => {
    const k1 = await makeEcKey('k1');
    keys.push(k1.jwk);
    await run(await signEs256(k1.privateKey, 'k1', { sub: 'u', iss: ISS, exp: future() }), { SUPABASE_URL });

    const k2 = await makeEcKey('k2');
    keys.push(k2.jwk);
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(Date.now() + 31_000);
    try {
      const r = await run(await signEs256(k2.privateKey, 'k2', { sub: 'u2', iss: ISS, exp: future() }), {
        SUPABASE_URL,
      });
      expect(r.status).toBe(200);
      expect(fetchMock).toHaveBeenCalledTimes(2);
    } finally {
      vi.useRealTimers();
    }
  });

  it('returns 500 (not 200) for an HS256 token when no secret is configured', async () => {
    const head = b64url(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
    const body = b64url(JSON.stringify({ sub: 'u', exp: future() }));
    const r = await run(`${head}.${body}.${b64url('sig')}`, { SUPABASE_URL });
    expect(r.status).toBe(500);
    expect(r.nextCalled).toBe(false);
  });

  it('rejects alg=none', async () => {
    const head = b64url(JSON.stringify({ alg: 'none', typ: 'JWT' }));
    const body = b64url(JSON.stringify({ sub: 'u', iss: ISS, exp: future() }));
    expect((await run(`${head}.${body}.`, { SUPABASE_URL })).status).toBe(401);
  });
});
