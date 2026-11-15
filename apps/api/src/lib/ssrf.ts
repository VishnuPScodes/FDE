/**
 * SSRF protection for server-side checks of learner-supplied URLs.
 *
 * Layers (all must pass):
 *  1. Static URL validation: https only, no credentials, default port only,
 *     no IP-literal hosts, no localhost / internal-looking names.
 *  2. DNS validation: resolve A and AAAA records through DNS-over-HTTPS
 *     (Cloudflare 1.1.1.1 JSON API) and reject when any answer is a private,
 *     loopback, link-local, CGNAT, metadata, multicast or reserved address.
 *  3. Fetch with `redirect: 'manual'`; every redirect target is re-validated
 *     (layers 1 and 2) before it is followed, at most MAX_REDIRECTS times.
 *  4. Hard timeout and response body size cap.
 *
 * Residual risk: the Workers runtime resolves DNS again when it fetches, so a
 * DNS-rebinding attacker could flip the answer between our check and the
 * fetch. Cloudflare Workers cannot reach private networks or the Worker
 * host's metadata service, so the impact is limited; the DoH check is defence
 * in depth and gives learners a clear error message.
 */

export const MAX_REDIRECTS = 3;
export const FETCH_TIMEOUT_MS = 5000;
export const MAX_BODY_BYTES = 256 * 1024;
const MAX_URL_LENGTH = 2048;

export class SsrfError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SsrfError';
  }
}

export interface UrlPolicy {
  /** Hosts that may use plain http (exact match). Empty by default: https only. */
  allowHttpHosts?: readonly string[];
}

const BLOCKED_HOST_SUFFIXES = [
  '.localhost',
  '.local',
  '.localdomain',
  '.internal',
  '.intranet',
  '.lan',
  '.home',
  '.corp',
  '.home.arpa',
  '.in-addr.arpa',
  '.ip6.arpa',
  '.onion',
  '.test',
  '.invalid',
  '.example',
];

const BLOCKED_HOSTS = new Set([
  'localhost',
  'localhost.localdomain',
  'metadata',
  'metadata.google.internal',
  'instance-data',
  'kubernetes',
  'kubernetes.default',
]);

/** True when the string looks like an IPv4 literal in any notation browsers accept. */
function looksLikeIpv4Literal(host: string): boolean {
  // Dotted decimal plus legacy forms: 2130706433, 0x7f.1, 017700000001, 127.1
  return /^(0x[0-9a-f]+|\d+)(\.(0x[0-9a-f]+|\d+)){0,3}$/i.test(host);
}

/**
 * Validate the shape of a URL before any network activity.
 * Throws SsrfError with a learner-readable message when the URL is not allowed.
 */
export function validateUrlShape(raw: string, policy: UrlPolicy = {}): URL {
  if (typeof raw !== 'string' || raw.length === 0) throw new SsrfError('URL is required.');
  if (raw.length > MAX_URL_LENGTH) throw new SsrfError('URL is too long.');
  if (/[\s\u0000-\u001f\u007f\\]/.test(raw)) throw new SsrfError('URL contains whitespace or control characters.');

  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new SsrfError('URL is not valid.');
  }

  const host = url.hostname.toLowerCase().replace(/\.$/, '');
  const allowHttp = (policy.allowHttpHosts ?? []).includes(host);
  if (url.protocol !== 'https:' && !(url.protocol === 'http:' && allowHttp)) {
    throw new SsrfError('Only https:// URLs can be checked.');
  }
  if (url.username || url.password) throw new SsrfError('URLs with a username or password are not allowed.');
  if (url.port !== '') throw new SsrfError('Only the default port (443) is allowed.');
  if (!host) throw new SsrfError('URL has no host.');
  if (host.startsWith('[') || host.includes(':')) throw new SsrfError('IP address hosts are not allowed. Use your app\'s domain name.');
  if (looksLikeIpv4Literal(host)) throw new SsrfError('IP address hosts are not allowed. Use your app\'s domain name.');
  if (!host.includes('.')) throw new SsrfError('Host must be a public domain name.');
  if (BLOCKED_HOSTS.has(host) || BLOCKED_HOST_SUFFIXES.some((suffix) => host.endsWith(suffix))) {
    throw new SsrfError('Local or internal host names are not allowed.');
  }
  if (!/^[a-z0-9.-]+$/.test(host)) throw new SsrfError('Host contains characters that are not allowed.');
  if (host.split('.').some((label) => label.length === 0 || label.length > 63)) {
    throw new SsrfError('Host name is not valid.');
  }
  return url;
}

// ─── IP range checks ──────────────────────────────────────────────────────────

function ipv4ToInt(ip: string): number | null {
  const parts = ip.split('.');
  if (parts.length !== 4) return null;
  let value = 0;
  for (const part of parts) {
    if (!/^\d{1,3}$/.test(part)) return null;
    const n = Number(part);
    if (n > 255) return null;
    value = value * 256 + n;
  }
  return value;
}

const IPV4_BLOCKED: [string, number][] = [
  ['0.0.0.0', 8], // "this" network
  ['10.0.0.0', 8], // private
  ['100.64.0.0', 10], // CGNAT
  ['127.0.0.0', 8], // loopback
  ['169.254.0.0', 16], // link-local incl. 169.254.169.254 metadata
  ['172.16.0.0', 12], // private
  ['192.0.0.0', 24], // IETF protocol assignments
  ['192.0.2.0', 24], // TEST-NET-1
  ['192.88.99.0', 24], // 6to4 relay anycast
  ['192.168.0.0', 16], // private
  ['198.18.0.0', 15], // benchmarking
  ['198.51.100.0', 24], // TEST-NET-2
  ['203.0.113.0', 24], // TEST-NET-3
  ['224.0.0.0', 4], // multicast
  ['240.0.0.0', 4], // reserved + broadcast
];

export function isBlockedIpv4(ip: string): boolean {
  const value = ipv4ToInt(ip);
  if (value === null) return true; // unparseable → treat as unsafe
  return IPV4_BLOCKED.some(([base, bits]) => {
    const baseValue = ipv4ToInt(base) ?? 0;
    const size = 2 ** (32 - bits);
    return value >= baseValue && value < baseValue + size;
  });
}

/** Expand an IPv6 address into 8 16-bit groups. Returns null when invalid. */
export function parseIpv6(ip: string): number[] | null {
  let addr = ip.toLowerCase().replace(/^\[|\]$/g, '');
  const zone = addr.indexOf('%');
  if (zone !== -1) addr = addr.slice(0, zone);
  // Embedded IPv4 tail, e.g. ::ffff:127.0.0.1
  const v4Match = /^(.*:)(\d{1,3}(?:\.\d{1,3}){3})$/.exec(addr);
  if (v4Match) {
    const v4 = ipv4ToInt(v4Match[2] ?? '');
    if (v4 === null) return null;
    addr = `${v4Match[1] ?? ''}${(v4 >>> 16).toString(16)}:${(v4 & 0xffff).toString(16)}`;
  }
  const halves = addr.split('::');
  if (halves.length > 2) return null;
  const head = halves[0] ? halves[0].split(':') : [];
  const tail = halves.length === 2 && halves[1] ? halves[1].split(':') : [];
  const missing = 8 - head.length - tail.length;
  if (halves.length === 1 && missing !== 0) return null;
  if (halves.length === 2 && missing < 1) return null;
  const groups = [...head, ...Array<string>(halves.length === 2 ? missing : 0).fill('0'), ...tail];
  if (groups.length !== 8) return null;
  const out: number[] = [];
  for (const group of groups) {
    if (!/^[0-9a-f]{1,4}$/.test(group)) return null;
    out.push(parseInt(group, 16));
  }
  return out;
}

function embeddedV4(groups: number[], hiIndex: number): string {
  const hi = groups[hiIndex] ?? 0;
  const lo = groups[hiIndex + 1] ?? 0;
  return [hi >> 8, hi & 0xff, lo >> 8, lo & 0xff].join('.');
}

export function isBlockedIpv6(ip: string): boolean {
  const g = parseIpv6(ip);
  if (!g) return true;
  const [g0, g1, g2, g3, g4, g5] = g as [number, number, number, number, number, number, number, number];
  const allZeroPrefix = g0 === 0 && g1 === 0 && g2 === 0 && g3 === 0 && g4 === 0;
  if (allZeroPrefix && g5 === 0 && g[6] === 0 && (g[7] === 0 || g[7] === 1)) return true; // :: and ::1
  if (allZeroPrefix && g5 === 0xffff) return isBlockedIpv4(embeddedV4(g, 6)); // IPv4-mapped
  if (allZeroPrefix && g5 === 0) return true; // deprecated IPv4-compatible
  if (g0 === 0x64 && g1 === 0xff9b) {
    // 64:ff9b::/96 well-known NAT64 → judge the embedded IPv4; 64:ff9b:1::/48 local-use → block
    return g2 === 0 && g3 === 0 && g4 === 0 && g5 === 0 ? isBlockedIpv4(embeddedV4(g, 6)) : true;
  }
  if (g0 === 0x0100 && g1 === 0 && g2 === 0 && g3 === 0) return true; // discard-only
  if (g0 === 0x2001 && g1 === 0) return true; // Teredo
  if (g0 === 0x2001 && g1 === 0x0db8) return true; // documentation
  if (g0 === 0x2002) return isBlockedIpv4(embeddedV4(g, 1)); // 6to4
  if ((g0 & 0xfe00) === 0xfc00) return true; // unique local fc00::/7
  if ((g0 & 0xffc0) === 0xfe80) return true; // link-local
  if ((g0 & 0xffc0) === 0xfec0) return true; // site-local (deprecated)
  if ((g0 & 0xff00) === 0xff00) return true; // multicast
  if (g0 === 0xfd00 && g1 === 0x0ec2) return true; // AWS IMDS IPv6 (inside fc00::/7 anyway)
  return false;
}

export function isBlockedIp(ip: string): boolean {
  return ip.includes(':') ? isBlockedIpv6(ip) : isBlockedIpv4(ip);
}

// ─── DNS over HTTPS ───────────────────────────────────────────────────────────

type FetchLike = (input: string | URL | Request, init?: RequestInit) => Promise<Response>;

interface DohAnswer { type: number; data: string }
interface DohResponse { Status: number; Answer?: DohAnswer[] }

const DOH_URL = 'https://cloudflare-dns.com/dns-query';

/** Resolve A + AAAA records with Cloudflare's DoH JSON API. */
export async function resolveHost(host: string, fetchImpl: FetchLike = fetch): Promise<string[]> {
  const ips: string[] = [];
  for (const type of ['A', 'AAAA'] as const) {
    const response = await fetchImpl(`${DOH_URL}?name=${encodeURIComponent(host)}&type=${type}`, {
      headers: { accept: 'application/dns-json' },
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    });
    if (!response.ok) throw new SsrfError('Could not resolve the host name right now. Try again in a minute.');
    const body = await response.json<DohResponse>();
    if (body.Status !== 0 && body.Status !== 3) throw new SsrfError('DNS lookup failed for this host.');
    for (const answer of body.Answer ?? []) {
      if (answer.type === 1 || answer.type === 28) ips.push(answer.data.trim());
    }
  }
  return ips;
}

/** Validate shape and resolved addresses. Returns the parsed URL when safe. */
export async function assertPublicUrl(raw: string, fetchImpl: FetchLike = fetch, policy: UrlPolicy = {}): Promise<URL> {
  const url = validateUrlShape(raw, policy);
  const host = url.hostname.toLowerCase().replace(/\.$/, '');
  const ips = await resolveHost(host, fetchImpl);
  if (ips.length === 0) throw new SsrfError('This host name does not resolve to any address. Check the spelling, or wait for DNS to update.');
  const blocked = ips.find((ip) => isBlockedIp(ip));
  if (blocked) throw new SsrfError('This host resolves to a private or reserved address, so it cannot be checked.');
  return url;
}

// ─── Safe fetch ───────────────────────────────────────────────────────────────

export interface SafeFetchResult {
  status: number;
  finalUrl: string;
  redirects: number;
  contentType: string;
  body: string;
  truncated: boolean;
}

async function readCapped(response: Response, limit: number): Promise<{ body: string; truncated: boolean }> {
  if (!response.body) return { body: '', truncated: false };
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  let truncated = false;
  for (;;) {
    const { done, value } = (await reader.read()) as { done: boolean; value?: Uint8Array };
    if (done || !value) break;
    if (total + value.byteLength > limit) {
      chunks.push(value.slice(0, limit - total));
      total = limit;
      truncated = true;
      await reader.cancel().catch(() => undefined);
      break;
    }
    chunks.push(value);
    total += value.byteLength;
  }
  const merged = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    merged.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return { body: new TextDecoder().decode(merged), truncated };
}

/**
 * Fetch a learner URL with SSRF protection, manual redirect handling
 * (each hop re-validated), a total timeout and a body size cap.
 */
export async function safeFetch(
  raw: string,
  options: { method?: 'GET' | 'HEAD'; fetchImpl?: FetchLike; policy?: UrlPolicy; timeoutMs?: number; maxBytes?: number } = {},
): Promise<SafeFetchResult> {
  const fetchImpl = options.fetchImpl ?? fetch;
  const method = options.method ?? 'GET';
  const signal = AbortSignal.timeout(options.timeoutMs ?? FETCH_TIMEOUT_MS);
  let current = raw;
  for (let redirects = 0; ; redirects++) {
    const url = await assertPublicUrl(current, fetchImpl, options.policy);
    let response: Response;
    try {
      response = await fetchImpl(url.toString(), {
        method,
        redirect: 'manual',
        signal,
        headers: { 'user-agent': 'FDE-Platform-Checker/1.0 (+learner live URL check)', accept: '*/*' },
      });
    } catch (err) {
      if ((err as Error).name === 'TimeoutError' || (err as Error).name === 'AbortError') {
        throw new SsrfError(`The site did not answer within ${String((options.timeoutMs ?? FETCH_TIMEOUT_MS) / 1000)} seconds.`);
      }
      throw new SsrfError('Could not connect to the site. Check that it is deployed and public.');
    }
    const location = response.headers.get('location');
    if (response.status >= 300 && response.status < 400 && location) {
      await response.body?.cancel().catch(() => undefined);
      if (redirects >= MAX_REDIRECTS) throw new SsrfError(`Too many redirects (more than ${String(MAX_REDIRECTS)}).`);
      current = new URL(location, url).toString();
      continue;
    }
    const { body, truncated } = method === 'HEAD' ? { body: '', truncated: false } : await readCapped(response, options.maxBytes ?? MAX_BODY_BYTES);
    return {
      status: response.status,
      finalUrl: url.toString(),
      redirects,
      contentType: response.headers.get('content-type') ?? '',
      body,
      truncated,
    };
  }
}

// ─── Tiny JSON path ───────────────────────────────────────────────────────────

/**
 * Read a value with a small JSON path: `$.status`, `data.items[0].name`, `$['key']`.
 * Returns `undefined` when the path does not exist.
 */
export function readJsonPath(value: unknown, path: string): unknown {
  const tokens: (string | number)[] = [];
  const re = /\[(\d+)\]|\['([^']*)'\]|\.?([^.[\]]+)/g;
  const trimmed = path.trim().replace(/^\$/, '');
  let match: RegExpExecArray | null;
  let consumed = 0;
  while ((match = re.exec(trimmed)) !== null) {
    if (match.index !== consumed) return undefined;
    consumed = re.lastIndex;
    if (match[1] !== undefined) tokens.push(Number(match[1]));
    else if (match[2] !== undefined) tokens.push(match[2]);
    else if (match[3] !== undefined) tokens.push(match[3]);
  }
  if (consumed !== trimmed.length) return undefined;
  let node: unknown = value;
  for (const token of tokens) {
    if (node === null || typeof node !== 'object') return undefined;
    if (typeof token === 'number') {
      if (!Array.isArray(node)) return undefined;
      node = node[token];
    } else {
      if (!Object.prototype.hasOwnProperty.call(node, token)) return undefined;
      node = (node as Record<string, unknown>)[token];
    }
  }
  return node;
}
