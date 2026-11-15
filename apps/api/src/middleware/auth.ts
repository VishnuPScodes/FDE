import type { Context, Next } from 'hono';
import type { AppEnv } from '../index';

type JwtPayload = Record<string, string | number | boolean | undefined>;

/**
 * JWT verification middleware for Supabase Auth.
 * Decodes and verifies the JWT from the Authorization header.
 * Attaches the decoded payload to c.set('userId', ...).
 *
 * Supports both Supabase signing modes:
 *  - Asymmetric JWT signing keys (ES256 / RS256): verified against the project's
 *    public JWKS at `${SUPABASE_URL}/auth/v1/.well-known/jwks.json`.
 *  - Legacy shared secret (HS256): verified with SUPABASE_JWT_SECRET, if configured.
 */
export async function authMiddleware(c: Context<AppEnv>, next: Next) {
  const authHeader = c.req.header('Authorization');
  if (!authHeader?.startsWith('Bearer ')) {
    return c.json({ error: 'Missing or malformed Authorization header' }, 401);
  }

  const token = authHeader.slice(7);

  try {
    const payload = await verifyJWT(token, {
      supabaseUrl: c.env.SUPABASE_URL,
      jwtSecret: c.env.SUPABASE_JWT_SECRET,
    });
    if (typeof payload.sub !== 'string' || !payload.sub) {
      return c.json({ error: 'Invalid token: missing subject' }, 401);
    }

    // Check expiration
    if (typeof payload.exp === 'number' && payload.exp < Math.floor(Date.now() / 1000)) {
      return c.json({ error: 'Token expired' }, 401);
    }

    // Set user info on context
    c.set('userId', payload.sub);
    c.set('userEmail', typeof payload.email === 'string' ? payload.email : '');
    c.set('userRole', typeof payload.role === 'string' ? payload.role : 'authenticated');

    await next();
  } catch (err) {
    if (err instanceof AuthConfigError) {
      console.error(err.message);
      return c.json({ error: 'Server configuration error' }, 500);
    }
    console.error('JWT verification failed:', err);
    return c.json({ error: 'Invalid token' }, 401);
  }
}

class AuthConfigError extends Error {}

interface VerifyOptions {
  supabaseUrl?: string;
  jwtSecret?: string;
}

/**
 * Verify a Supabase JWT using the Web Crypto API (no external dependencies, works in Workers).
 * The algorithm is taken from the header but each algorithm is bound to exactly one key source,
 * so a token cannot pick e.g. HS256 with a public key as the HMAC secret.
 */
async function verifyJWT(token: string, opts: VerifyOptions): Promise<JwtPayload> {
  const parts = token.split('.');
  if (parts.length !== 3) throw new Error('Invalid JWT format');

  const [headerB64, payloadB64, signatureB64] = parts as [string, string, string];
  const header = JSON.parse(new TextDecoder().decode(base64UrlDecode(headerB64))) as {
    alg?: string;
    kid?: string;
  };

  const data = new TextEncoder().encode(`${headerB64}.${payloadB64}`);
  const signature = base64UrlDecode(signatureB64);
  let valid: boolean;

  if (header.alg === 'HS256') {
    if (!opts.jwtSecret) {
      throw new AuthConfigError('HS256 token received but SUPABASE_JWT_SECRET is not configured');
    }
    const key = await crypto.subtle.importKey(
      'raw',
      new TextEncoder().encode(opts.jwtSecret),
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['verify'],
    );
    valid = await crypto.subtle.verify('HMAC', key, signature, data);
  } else if (header.alg === 'ES256' || header.alg === 'RS256') {
    if (!opts.supabaseUrl) throw new AuthConfigError('SUPABASE_URL not configured');
    if (!header.kid) throw new Error('Token missing kid');
    const jwk = await getJwk(opts.supabaseUrl, header.kid);
    if (jwk.alg && jwk.alg !== header.alg) throw new Error('Key/algorithm mismatch');
    const algo =
      header.alg === 'ES256'
        ? { import: { name: 'ECDSA', namedCurve: 'P-256' }, verify: { name: 'ECDSA', hash: 'SHA-256' } }
        : { import: { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, verify: { name: 'RSASSA-PKCS1-v1_5' } };
    const key = await crypto.subtle.importKey('jwk', jwk, algo.import, false, ['verify']);
    valid = await crypto.subtle.verify(algo.verify, key, signature, data);
  } else {
    throw new Error(`Unsupported JWT alg: ${String(header.alg)}`);
  }

  if (!valid) throw new Error('Invalid signature');

  const payload = JSON.parse(new TextDecoder().decode(base64UrlDecode(payloadB64))) as JwtPayload;

  // Asymmetric tokens: make sure the token was issued by this project's Auth server.
  if (header.alg !== 'HS256' && opts.supabaseUrl) {
    const expectedIss = `${opts.supabaseUrl.replace(/\/+$/, '')}/auth/v1`;
    if (payload.iss !== expectedIss) throw new Error('Unexpected token issuer');
  }

  return payload;
}

// ---------------------------------------------------------------------------
// JWKS cache (per Worker isolate)
// ---------------------------------------------------------------------------
type Jwk = JsonWebKey & { kid?: string; alg?: string };

const JWKS_TTL_MS = 10 * 60 * 1000;
const JWKS_MIN_REFETCH_MS = 30 * 1000;
let jwksCache: { url: string; keys: Jwk[]; fetchedAt: number } | null = null;

async function getJwk(supabaseUrl: string, kid: string): Promise<Jwk> {
  const url = `${supabaseUrl.replace(/\/+$/, '')}/auth/v1/.well-known/jwks.json`;
  const now = Date.now();
  const cached = jwksCache?.url === url ? jwksCache : null;

  let key = cached && now - cached.fetchedAt < JWKS_TTL_MS ? cached.keys.find((k) => k.kid === kid) : undefined;
  if (key) return key;

  // Unknown kid (key rotation) or stale cache: refetch, but not more often than every 30s.
  if (!cached || now - cached.fetchedAt >= JWKS_MIN_REFETCH_MS) {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`JWKS fetch failed: ${res.status}`);
    const body = await res.json<{ keys?: Jwk[] }>();
    jwksCache = { url, keys: body.keys ?? [], fetchedAt: now };
  }

  key = jwksCache?.keys.find((k) => k.kid === kid);
  if (!key) throw new Error('No matching signing key for kid');
  return key;
}

/** Test hook: clear the JWKS cache. */
export function _resetJwksCache() {
  jwksCache = null;
}

function base64UrlDecode(str: string): ArrayBuffer {
  // Replace URL-safe chars and add padding
  const base64 = str.replace(/-/g, '+').replace(/_/g, '/');
  const padding = '='.repeat((4 - (base64.length % 4)) % 4);
  const binary = atob(base64 + padding);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes.buffer;
}
