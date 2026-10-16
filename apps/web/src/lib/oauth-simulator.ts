const ISSUER = 'https://login.fde.test';
const DEMO_SIGNING_SECRET = 'fde-oauth-demo-signing-secret-do-not-use-in-production';
export const DEMO_CLIENT_ID = 'fde-browser-demo';
export const DEMO_CLIENT_SECRET = 'fde-training-client-secret';
export const DEMO_REDIRECT_URI = 'https://app.fde.test/callback';

interface PendingAuthorization {
  clientId: string;
  redirectUri: string;
  challenge: string;
  nonce: string;
  scope: string;
}

export interface OAuthTokenResponse {
  access_token: string;
  id_token: string;
  token_type: 'Bearer';
  expires_in: number;
  scope: string;
}

export interface TokenVerification {
  valid: boolean;
  reason: string;
  header?: Record<string, unknown>;
  claims?: Record<string, unknown>;
}

const pendingCodes = new Map<string, PendingAuthorization>();

export async function createPkcePair(): Promise<{ verifier: string; challenge: string }> {
  const random = crypto.getRandomValues(new Uint8Array(32));
  const verifier = base64Url(random);
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier));
  return { verifier, challenge: base64Url(new Uint8Array(digest)) };
}

export function createOAuthState(): string {
  return base64Url(crypto.getRandomValues(new Uint8Array(18)));
}

export async function authorizeWithPkce(input: PendingAuthorization & { state: string }): Promise<{ code: string; state: string }> {
  const code = createOAuthState();
  pendingCodes.set(code, input);
  return { code, state: input.state };
}

export async function exchangeAuthorizationCode(input: {
  code: string;
  verifier: string;
  clientId: string;
  redirectUri: string;
}): Promise<OAuthTokenResponse> {
  const pending = pendingCodes.get(input.code);
  if (!pending) throw new Error('Authorization code is invalid, expired, or already used.');
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(input.verifier));
  const challenge = base64Url(new Uint8Array(digest));
  if (input.clientId !== pending.clientId || input.redirectUri !== pending.redirectUri || challenge !== pending.challenge) {
    throw new Error('PKCE or client validation failed. Check the verifier, client ID, and redirect URI.');
  }
  pendingCodes.delete(input.code);
  return issueTokenResponse(pending.clientId, pending.scope, pending.nonce);
}

export async function requestClientCredentialsToken(input: {
  clientId: string;
  clientSecret: string;
  scope: string;
}): Promise<OAuthTokenResponse> {
  if (input.clientId !== DEMO_CLIENT_ID || input.clientSecret !== DEMO_CLIENT_SECRET) {
    throw new Error('Client authentication failed. Check the demo client ID and secret.');
  }
  const allowed = new Set(['api:read', 'api:write']);
  const scope = input.scope.split(/\s+/).filter((value) => allowed.has(value)).join(' ');
  if (!scope) throw new Error('Request at least one supported scope: api:read or api:write.');
  return issueTokenResponse(input.clientId, scope);
}

export async function verifyMockJwt(token: string, expectedNonce?: string, expectedAudience?: string): Promise<TokenVerification> {
  try {
    const parts = token.split('.');
    if (parts.length !== 3) return { valid: false, reason: 'A JWT must contain three dot-separated parts.' };
    const header = JSON.parse(decodeBase64Url(parts[0]!)) as Record<string, unknown>;
    const claims = JSON.parse(decodeBase64Url(parts[1]!)) as Record<string, unknown>;
    if (header.alg !== 'HS256') return { valid: false, reason: 'Unsupported signing algorithm.' };
    const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(DEMO_SIGNING_SECRET), { name: 'HMAC', hash: 'SHA-256' }, false, ['verify']);
    const validSignature = await crypto.subtle.verify('HMAC', key, decodeBase64UrlBytes(parts[2]!), new TextEncoder().encode(`${parts[0]}.${parts[1]}`));
    if (!validSignature) return { valid: false, reason: 'Signature verification failed.' , header, claims };
    if (claims.iss !== ISSUER) return { valid: false, reason: 'Issuer does not match the trusted provider.', header, claims };
    if (expectedAudience && claims.aud !== expectedAudience) return { valid: false, reason: 'Audience does not match this client.', header, claims };
    if (typeof claims.exp !== 'number' || claims.exp <= Math.floor(Date.now() / 1000)) return { valid: false, reason: 'Token is expired.', header, claims };
    if (expectedNonce && claims.nonce !== expectedNonce) return { valid: false, reason: 'OIDC nonce does not match the authorization request.', header, claims };
    return { valid: true, reason: 'Signature, issuer, audience, expiry, and requested nonce are valid.', header, claims };
  } catch (error) {
    return { valid: false, reason: (error as Error).message || 'Token could not be decoded.' };
  }
}

async function issueTokenResponse(clientId: string, scope: string, nonce?: string): Promise<OAuthTokenResponse> {
  const now = Math.floor(Date.now() / 1000);
  const claims: Record<string, unknown> = {
    iss: ISSUER,
    aud: clientId,
    sub: nonce ? 'user-vishnu-demo' : `service:${clientId}`,
    iat: now,
    exp: now + 900,
    scope,
  };
  if (nonce) Object.assign(claims, { nonce, email: 'learner@example.test', name: 'Demo Learner' });
  const accessToken = await signJwt({ ...claims, token_use: 'access' });
  const idToken = await signJwt({ ...claims, token_use: 'id' });
  return { access_token: accessToken, id_token: idToken, token_type: 'Bearer', expires_in: 900, scope };
}

async function signJwt(claims: Record<string, unknown>): Promise<string> {
  const header = base64Url(new TextEncoder().encode(JSON.stringify({ alg: 'HS256', typ: 'JWT' })));
  const payload = base64Url(new TextEncoder().encode(JSON.stringify(claims)));
  const unsigned = `${header}.${payload}`;
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(DEMO_SIGNING_SECRET), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const signature = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(unsigned));
  return `${unsigned}.${base64Url(new Uint8Array(signature))}`;
}

function base64Url(bytes: Uint8Array): string {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/g, '');
}

function decodeBase64Url(value: string): string {
  return new TextDecoder().decode(decodeBase64UrlBytes(value));
}

function decodeBase64UrlBytes(value: string): Uint8Array {
  const base64 = value.replaceAll('-', '+').replaceAll('_', '/') + '='.repeat((4 - value.length % 4) % 4);
  return Uint8Array.from(atob(base64), (character) => character.charCodeAt(0));
}
