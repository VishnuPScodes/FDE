import type { Context, Next } from 'hono';
import type { AppEnv } from '../index';

/**
 * JWT verification middleware for Supabase Auth.
 * Decodes and verifies the JWT from the Authorization header.
 * Attaches the decoded payload to c.set('userId', ...).
 *
 * Uses Supabase JWT secret (HMAC HS256) for verification.
 */
export async function authMiddleware(c: Context<AppEnv>, next: Next) {
  const authHeader = c.req.header('Authorization');
  if (!authHeader?.startsWith('Bearer ')) {
    return c.json({ error: 'Missing or malformed Authorization header' }, 401);
  }

  const token = authHeader.slice(7);
  const jwtSecret = c.env.SUPABASE_JWT_SECRET;

  if (!jwtSecret) {
    console.error('SUPABASE_JWT_SECRET not configured');
    return c.json({ error: 'Server configuration error' }, 500);
  }

  try {
    const payload = await verifyJWT(token, jwtSecret);
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
    console.error('JWT verification failed:', err);
    return c.json({ error: 'Invalid token' }, 401);
  }
}

/**
 * Verify a Supabase JWT (HS256) using the Web Crypto API.
 * This works in Cloudflare Workers without any external dependencies.
 */
async function verifyJWT(
  token: string,
  secret: string,
): Promise<Record<string, string | number | boolean | undefined>> {
  const parts = token.split('.');
  if (parts.length !== 3) throw new Error('Invalid JWT format');

  const [headerB64, payloadB64, signatureB64] = parts as [string, string, string];

  // Import the secret key for HMAC SHA-256
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['verify'],
  );

  // Verify signature
  const data = encoder.encode(`${headerB64}.${payloadB64}`);
  const signature = base64UrlDecode(signatureB64);

  const valid = await crypto.subtle.verify('HMAC', key, signature, data);
  if (!valid) throw new Error('Invalid signature');

  // Decode payload
  const payloadStr = new TextDecoder().decode(base64UrlDecode(payloadB64));
  return JSON.parse(payloadStr) as Record<string, string | number | boolean | undefined>;
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
