import { describe, expect, it } from 'vitest';
import { assertPublicUrl, isBlockedIp, parseIpv6, readJsonPath, safeFetch, SsrfError, validateUrlShape } from '../lib/ssrf';

type FetchLike = (input: string | URL | Request, init?: RequestInit) => Promise<Response>;

/** Fake fetch: DoH answers from `dns`, site responses from `sites` keyed by full URL. */
function fakeFetch(dns: Record<string, string[]>, sites: Record<string, () => Response> = {}): FetchLike & { calls: string[] } {
  const calls: string[] = [];
  const fn = (async (input: string | URL | Request) => {
    await Promise.resolve();
    const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
    calls.push(url);
    if (url.startsWith('https://cloudflare-dns.com/dns-query')) {
      const params = new URL(url).searchParams;
      const name = params.get('name') ?? '';
      const type = params.get('type');
      const ips = (dns[name] ?? []).filter((ip) => (type === 'AAAA' ? ip.includes(':') : !ip.includes(':')));
      return new Response(JSON.stringify({ Status: dns[name] ? 0 : 3, Answer: ips.map((data) => ({ type: type === 'AAAA' ? 28 : 1, data })) }), { status: 200 });
    }
    const site = sites[url];
    if (!site) throw new TypeError('connect failed');
    return site();
  }) as FetchLike & { calls: string[] };
  fn.calls = calls;
  return fn;
}

describe('validateUrlShape', () => {
  const rejected: [string, RegExp][] = [
    ['http://clinic-app.pages.dev/', /https/],
    ['ftp://clinic-app.pages.dev/', /https/],
    ['file:///etc/passwd', /https/],
    ['javascript:alert(1)', /https/],
    ['gopher://clinic-app.pages.dev/', /https/],
    ['https://user:pass@clinic-app.pages.dev/', /username or password/],
    ['https://user@clinic-app.pages.dev/', /username or password/],
    ['https://clinic-app.pages.dev:8443/', /port/],
    ['https://clinic-app.pages.dev:22/', /port/],
    ['https://127.0.0.1/', /IP address/],
    ['https://10.0.0.5/', /IP address/],
    ['https://169.254.169.254/latest/meta-data/', /IP address/],
    ['https://2130706433/', /IP address/],
    ['https://0x7f000001/', /IP address/],
    ['https://0x7f.1/', /IP address/],
    ['https://017700000001/', /IP address/],
    ['https://127.1/', /IP address/],
    ['https://[::1]/', /IP address/],
    ['https://[::ffff:127.0.0.1]/', /IP address/],
    ['https://[fd00:ec2::254]/', /IP address/],
    ['https://localhost/', /public domain|Local/],
    ['https://LOCALHOST./', /public domain|Local/],
    ['https://api.localhost/', /Local/],
    ['https://printer.local/', /Local/],
    ['https://metadata.google.internal/computeMetadata/v1/', /Local/],
    ['https://db.corp/', /Local/],
    ['https://router.home.arpa/', /Local/],
    ['https://intranet/', /public domain/],
    ['https://site.test/', /Local/],
    ['https://clinic app.pages.dev/', /whitespace|not valid/],
    ['https://clinic-app.pages.dev/\n', /whitespace/],
    ['https:\\\\evil.com', /whitespace|not valid/],
    ['not a url', /whitespace|not valid/],
    ['', /required/],
    [`https://a.dev/${'x'.repeat(2100)}`, /too long/],
  ];
  for (const [url, message] of rejected) {
    it(`rejects ${JSON.stringify(url.slice(0, 60))}`, () => {
      expect(() => validateUrlShape(url)).toThrow(SsrfError);
      expect(() => validateUrlShape(url)).toThrow(message);
    });
  }

  const accepted = [
    'https://clinic-app.pages.dev/',
    'https://clinic-app.pages.dev/health?full=1',
    'https://priya-dev.github.io/gst-helper/',
    'https://huggingface.co/spaces/priya/triage',
    'https://CLINIC-APP.pages.dev:443/',
    'https://xn--80ak6aa92e.com/',
  ];
  for (const url of accepted) {
    it(`accepts ${url}`, () => {
      expect(validateUrlShape(url)).toBeInstanceOf(URL);
    });
  }

  it('allows http only for allowlisted hosts', () => {
    expect(() => validateUrlShape('http://neverssl.com/')).toThrow(/https/);
    expect(validateUrlShape('http://neverssl.com/', { allowHttpHosts: ['neverssl.com'] }).protocol).toBe('http:');
  });
});

describe('isBlockedIp', () => {
  const blocked = [
    '0.0.0.0', '10.1.2.3', '100.64.0.1', '100.127.255.254', '127.0.0.1', '127.255.255.255',
    '169.254.169.254', '172.16.0.1', '172.31.255.255', '192.0.0.170', '192.0.2.1', '192.168.1.1',
    '198.18.0.1', '198.51.100.7', '203.0.113.9', '224.0.0.1', '239.255.255.250', '240.0.0.1', '255.255.255.255',
    '::', '::1', '::ffff:127.0.0.1', '::ffff:7f00:1', '::ffff:10.0.0.1', '::ffff:169.254.169.254', '::127.0.0.1',
    'fc00::1', 'fd00:ec2::254', 'fe80::1', 'fe80::1%eth0', 'febf::1', 'fec0::1', 'ff02::1',
    '64:ff9b::7f00:1', '64:ff9b::a9fe:a9fe', '64:ff9b:1::1', '2002:7f00:1::', '2002:c0a8:101::1',
    '2001:db8::1', '2001:0:4136:e378::1', '100::1', 'not-an-ip', '1.2.3', '1.2.3.256',
  ];
  for (const ip of blocked) it(`blocks ${ip}`, () => {
    expect(isBlockedIp(ip)).toBe(true);
  });

  const allowed = ['1.1.1.1', '8.8.8.8', '104.16.132.229', '172.32.0.1', '100.128.0.1', '2606:4700:4700::1111', '2a00:1450:4001:80b::200e', '::ffff:8.8.8.8', '64:ff9b::808:808', '2002:808:808::1'];
  for (const ip of allowed) it(`allows ${ip}`, () => {
    expect(isBlockedIp(ip)).toBe(false);
  });

  it('parses compressed IPv6 forms', () => {
    expect(parseIpv6('::1')).toEqual([0, 0, 0, 0, 0, 0, 0, 1]);
    expect(parseIpv6('2001:db8::')).toEqual([0x2001, 0xdb8, 0, 0, 0, 0, 0, 0]);
    expect(parseIpv6('1:2:3:4:5:6:7:8:9')).toBeNull();
    expect(parseIpv6('1::2::3')).toBeNull();
  });
});

describe('assertPublicUrl (DNS)', () => {
  it('accepts a host that resolves to public addresses', async () => {
    const f = fakeFetch({ 'clinic-app.pages.dev': ['104.16.1.1', '2606:4700::1'] });
    await expect(assertPublicUrl('https://clinic-app.pages.dev/', f)).resolves.toBeInstanceOf(URL);
  });
  it('rejects a host that resolves to 127.0.0.1 (DNS pointing at loopback)', async () => {
    const f = fakeFetch({ 'evil.example.com': ['127.0.0.1'] });
    await expect(assertPublicUrl('https://evil.example.com/', f)).rejects.toThrow(/private or reserved/);
  });
  it('rejects when any of several answers is private', async () => {
    const f = fakeFetch({ 'mixed.attacker.dev': ['93.184.216.34', '10.0.0.7'] });
    await expect(assertPublicUrl('https://mixed.attacker.dev/', f)).rejects.toThrow(/private or reserved/);
  });
  it('rejects private AAAA answers', async () => {
    const f = fakeFetch({ 'v6.attacker.dev': ['fd12:3456::1'] });
    await expect(assertPublicUrl('https://v6.attacker.dev/', f)).rejects.toThrow(/private or reserved/);
  });
  it('rejects the cloud metadata address', async () => {
    const f = fakeFetch({ 'meta.attacker.dev': ['169.254.169.254'] });
    await expect(assertPublicUrl('https://meta.attacker.dev/', f)).rejects.toThrow(/private or reserved/);
  });
  it('rejects hosts with no records', async () => {
    const f = fakeFetch({});
    await expect(assertPublicUrl('https://nothing-here.pages.dev/', f)).rejects.toThrow(/does not resolve/);
  });
  it('does not call DNS for statically invalid URLs', async () => {
    const f = fakeFetch({});
    await expect(assertPublicUrl('https://127.0.0.1/', f)).rejects.toThrow(SsrfError);
    expect(f.calls).toHaveLength(0);
  });
});

describe('safeFetch', () => {
  const dns = { 'clinic-app.pages.dev': ['104.16.1.1'], 'www.clinic-app.pages.dev': ['104.16.1.2'], 'evil.attacker.dev': ['10.0.0.1'] };

  it('returns status and body', async () => {
    const f = fakeFetch(dns, { 'https://clinic-app.pages.dev/health': () => new Response('{"status":"ok"}', { status: 200, headers: { 'content-type': 'application/json' } }) });
    const result = await safeFetch('https://clinic-app.pages.dev/health', { fetchImpl: f });
    expect(result.status).toBe(200);
    expect(result.body).toBe('{"status":"ok"}');
    expect(result.redirects).toBe(0);
  });

  it('follows a safe redirect and re-validates it', async () => {
    const f = fakeFetch(dns, {
      'https://clinic-app.pages.dev/': () => new Response(null, { status: 301, headers: { location: 'https://www.clinic-app.pages.dev/' } }),
      'https://www.clinic-app.pages.dev/': () => new Response('hello', { status: 200 }),
    });
    const result = await safeFetch('https://clinic-app.pages.dev/', { fetchImpl: f });
    expect(result.finalUrl).toBe('https://www.clinic-app.pages.dev/');
    expect(result.redirects).toBe(1);
  });

  it('blocks a redirect to a private host', async () => {
    const f = fakeFetch(dns, { 'https://clinic-app.pages.dev/': () => new Response(null, { status: 302, headers: { location: 'https://evil.attacker.dev/admin' } }) });
    await expect(safeFetch('https://clinic-app.pages.dev/', { fetchImpl: f })).rejects.toThrow(/private or reserved/);
  });

  it('blocks a redirect to an IP literal / http / metadata', async () => {
    for (const location of ['http://169.254.169.254/latest/meta-data/', 'https://127.0.0.1/', 'http://clinic-app.pages.dev/']) {
      const f = fakeFetch(dns, { 'https://clinic-app.pages.dev/': () => new Response(null, { status: 302, headers: { location } }) });
      await expect(safeFetch('https://clinic-app.pages.dev/', { fetchImpl: f })).rejects.toThrow(SsrfError);
    }
  });

  it('stops after 3 redirects', async () => {
    const f = fakeFetch(dns, { 'https://clinic-app.pages.dev/': () => new Response(null, { status: 302, headers: { location: '/' } }) });
    await expect(safeFetch('https://clinic-app.pages.dev/', { fetchImpl: f })).rejects.toThrow(/Too many redirects/);
  });

  it('caps the body size', async () => {
    const big = 'x'.repeat(300 * 1024);
    const f = fakeFetch(dns, { 'https://clinic-app.pages.dev/': () => new Response(big, { status: 200 }) });
    const result = await safeFetch('https://clinic-app.pages.dev/', { fetchImpl: f });
    expect(result.truncated).toBe(true);
    expect(result.body.length).toBe(256 * 1024);
  });

  it('times out slow sites', async () => {
    const slow: FetchLike = async (input, init) => {
      const url = input instanceof Request ? input.url : input.toString();
      if (url.startsWith('https://cloudflare-dns.com')) return fakeFetch(dns)(input, init);
      return new Promise((_, reject) => {
        init?.signal?.addEventListener('abort', () => {
          reject(Object.assign(new Error('aborted'), { name: 'TimeoutError' }));
        });
      });
    };
    await expect(safeFetch('https://clinic-app.pages.dev/', { fetchImpl: slow, timeoutMs: 50 })).rejects.toThrow(/did not answer/);
  });

  it('reports connection failures clearly', async () => {
    const f = fakeFetch(dns, {});
    await expect(safeFetch('https://clinic-app.pages.dev/', { fetchImpl: f })).rejects.toThrow(/Could not connect/);
  });
});

describe('readJsonPath', () => {
  const doc = { status: 'ok', data: { items: [{ name: 'Pune clinic' }] }, 'odd key': 1 };
  it('reads paths', () => {
    expect(readJsonPath(doc, '$.status')).toBe('ok');
    expect(readJsonPath(doc, 'status')).toBe('ok');
    expect(readJsonPath(doc, '$.data.items[0].name')).toBe('Pune clinic');
    expect(readJsonPath(doc, "$['odd key']")).toBe(1);
  });
  it('returns undefined for missing or malformed paths', () => {
    expect(readJsonPath(doc, '$.missing')).toBeUndefined();
    expect(readJsonPath(doc, '$.data.items[5].name')).toBeUndefined();
    expect(readJsonPath(doc, '$.__proto__')).toBeUndefined();
    expect(readJsonPath(doc, '$.status[')).toBeUndefined();
  });
});
