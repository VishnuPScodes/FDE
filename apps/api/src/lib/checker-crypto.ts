/**
 * Crypto for the checker CLI token scheme. See apps/checker/README.md
 * ("Token and signature design") for the full rationale.
 *
 *   token T        = "fdec_" + base64url(32 random bytes)   (shown to learner once)
 *   token_id       = hex(SHA-256(T))                        (stored, used for lookup)
 *   signing key K  = HMAC-SHA256(key = T, "fde-checker-signing-v1")
 *   stored         = AES-GCM(K) under a key derived from the Worker secret
 *                    CHECKER_KEY_SECRET                    (never T itself)
 *   signature      = hex(HMAC-SHA256(K, payload))           (payload = exact JSON string sent)
 *
 * A database leak alone cannot forge results (K is encrypted) and cannot
 * recover T (only its hash is stored). The Worker secret alone is useless
 * without the database row.
 */

export const SIGNING_CONTEXT = 'fde-checker-signing-v1';
const encoder = new TextEncoder();

export function bytesToHex(bytes: ArrayBuffer | Uint8Array): string {
  return [...new Uint8Array(bytes)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

export function hexToBytes(hex: string): Uint8Array {
  if (!/^(?:[0-9a-f]{2})*$/i.test(hex)) throw new Error('Invalid hex');
  const out = new Uint8Array(hex.length / 2);
  for (let i = 0; i < out.length; i++) out[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  return out;
}

function toBase64Url(bytes: Uint8Array): string {
  let binary = '';
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function fromBase64Url(text: string): Uint8Array {
  const base64 = text.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - (text.length % 4)) % 4);
  const binary = atob(base64);
  const out = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) out[i] = binary.charCodeAt(i);
  return out;
}

export function randomToken(prefix: string, byteLength = 32): string {
  return `${prefix}${toBase64Url(crypto.getRandomValues(new Uint8Array(byteLength)))}`;
}

export async function sha256Hex(text: string): Promise<string> {
  return bytesToHex(await crypto.subtle.digest('SHA-256', encoder.encode(text)));
}

export async function hmacSha256(key: Uint8Array, message: string): Promise<Uint8Array> {
  const cryptoKey = await crypto.subtle.importKey('raw', key, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return new Uint8Array(await crypto.subtle.sign('HMAC', cryptoKey, encoder.encode(message)));
}

/** K = HMAC-SHA256(key = token, SIGNING_CONTEXT). The CLI computes the same value. */
export async function deriveSigningKey(token: string): Promise<Uint8Array> {
  return hmacSha256(encoder.encode(token), SIGNING_CONTEXT);
}

async function aesKey(secret: string): Promise<CryptoKey> {
  if (!secret || secret.length < 32) throw new Error('CHECKER_KEY_SECRET must be at least 32 characters.');
  const raw = await crypto.subtle.digest('SHA-256', encoder.encode(`fde-checker-kek-v1:${secret}`));
  return crypto.subtle.importKey('raw', raw, { name: 'AES-GCM' }, false, ['encrypt', 'decrypt']);
}

export async function encryptSigningKey(key: Uint8Array, secret: string): Promise<string> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ciphertext = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, await aesKey(secret), key);
  return `v1.${toBase64Url(iv)}.${toBase64Url(new Uint8Array(ciphertext))}`;
}

export async function decryptSigningKey(stored: string, secret: string): Promise<Uint8Array> {
  const [version, ivText, ctText] = stored.split('.');
  if (version !== 'v1' || !ivText || !ctText) throw new Error('Unknown key format');
  const plain = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: fromBase64Url(ivText) }, await aesKey(secret), fromBase64Url(ctText));
  return new Uint8Array(plain);
}

/** Constant-time comparison of two hex strings. */
export function timingSafeEqualHex(a: string, b: string): boolean {
  const left = a.toLowerCase();
  const right = b.toLowerCase();
  let diff = left.length ^ right.length;
  const length = Math.max(left.length, right.length);
  for (let i = 0; i < length; i++) diff |= (left.charCodeAt(i) || 0) ^ (right.charCodeAt(i) || 0);
  return diff === 0;
}

export async function signPayload(key: Uint8Array, payload: string): Promise<string> {
  return bytesToHex(await hmacSha256(key, payload));
}

export async function verifyPayloadSignature(key: Uint8Array, payload: string, signature: string): Promise<boolean> {
  if (!/^[0-9a-f]{64}$/i.test(signature)) return false;
  return timingSafeEqualHex(await signPayload(key, payload), signature);
}
