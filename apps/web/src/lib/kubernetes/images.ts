/**
 * The simulated container registry. Each image describes how its "app"
 * behaves so pod outcomes (crashes, OOM, probes, HTTP) are deterministic.
 */

export interface HttpRoute { status: number; body: string; contentType?: string }

export interface ImageInfo {
  /** Port the process listens on (undefined = no network listener). */
  port?: number;
  protocol?: 'http' | 'tcp';
  routes: Record<string, HttpRoute>;
  /** Env vars the process refuses to start without. */
  requiredEnv: string[];
  /** Working set in MiB once warmed up. */
  memoryMi: number;
  cpuMilli: number;
  binaries: string[];
  defaultCommand: string[];
  startupLog: (env: Record<string, string>, podName: string) => string;
  crashLog: (missing: string) => string;
  /** Crashes on start regardless of config (a broken release). */
  brokenLog?: string;
  /** Exits 0 when its command finishes (batch images). */
  batch?: boolean;
}

const SHELL_TOOLS = ['sh', 'env', 'printenv', 'cat', 'ls', 'echo', 'hostname', 'sleep', 'wget'];

const nginx: ImageInfo = {
  port: 80, protocol: 'http',
  routes: { '/': { status: 200, body: '<!DOCTYPE html>\n<html>\n<head><title>Welcome to nginx!</title></head>\n<body><h1>Welcome to nginx!</h1></body>\n</html>' } },
  requiredEnv: [], memoryMi: 7, cpuMilli: 1,
  binaries: [...SHELL_TOOLS, 'nginx', 'curl'], defaultCommand: ['nginx', '-g', 'daemon off;'],
  startupLog: () => [
    '/docker-entrypoint.sh: /docker-entrypoint.d/ is not empty, will attempt to perform configuration',
    '/docker-entrypoint.sh: Looking for shell scripts in /docker-entrypoint.d/',
    '/docker-entrypoint.sh: Configuration complete; ready for start up',
    '2026/01/15 04:30:05 [notice] 1#1: nginx/1.27.0',
    '2026/01/15 04:30:05 [notice] 1#1: start worker processes',
  ].join('\n') + '\n',
  crashLog: () => '',
};

function goService(name: string, port: number, routes: Record<string, HttpRoute>, extra: Partial<ImageInfo> = {}): ImageInfo {
  return {
    port, protocol: 'http', routes, requiredEnv: [], memoryMi: 48, cpuMilli: 12,
    binaries: [...SHELL_TOOLS, '/app/server', 'curl'], defaultCommand: ['/app/server'],
    startupLog: (env) => `{"level":"info","msg":"starting ${name}","port":${port}${env.APP_ENV ? ',"env":"' + env.APP_ENV + '"' : ''}}\n{"level":"info","msg":"listening on :${port}"}\n`,
    crashLog: (missing) => '{"level":"fatal","msg":"config error: required environment variable ' + missing + ' is not set"}\n',
    ...extra,
  };
}

const ordersRoutes: Record<string, HttpRoute> = {
  '/healthz': { status: 200, body: 'ok' },
  '/orders': { status: 200, body: '[{"id":"ORD-1042","city":"Bengaluru","total_inr":2499},{"id":"ORD-1043","city":"Kochi","total_inr":899}]', contentType: 'application/json' },
};
const storefrontRoutes: Record<string, HttpRoute> = {
  '/': { status: 200, body: '<html><title>Kirana Mart</title><body>Fresh groceries delivered in Bengaluru</body></html>' },
  '/healthz': { status: 200, body: 'ok' },
};

const catalog: Record<string, ImageInfo> = {
  'nginx': nginx,
  'ghcr.io/fde-labs/orders-api:1.0.0': goService('orders-api', 8080, ordersRoutes),
  'ghcr.io/fde-labs/orders-api:1.1.0': goService('orders-api', 8080, ordersRoutes),
  'ghcr.io/fde-labs/orders-api:1.2.0': goService('orders-api', 8080, ordersRoutes, {
    brokenLog: '{"level":"info","msg":"starting orders-api","port":8080}\npanic: runtime error: invalid memory address or nil pointer dereference\n[signal SIGSEGV: segmentation violation code=0x1 addr=0x18 pc=0x6f2a1c]\n\ngoroutine 1 [running]:\nmain.loadPricingRules(...)\n\t/src/pricing.go:41\n',
  }),
  'ghcr.io/fde-labs/storefront:3.1.0': goService('storefront', 3000, storefrontRoutes, { memoryMi: 64 }),
  'ghcr.io/fde-labs/storefront:3.2.0': goService('storefront', 3000, storefrontRoutes, { memoryMi: 66 }),
  'ghcr.io/fde-labs/invoice-api:1.4.0': goService('invoice-api', 8000, {
    '/healthz': { status: 200, body: 'ok' },
    '/invoices': { status: 200, body: '[{"invoice":"GST/2025-26/0187","client":"Shah Textiles, Surat","amount_inr":118000}]', contentType: 'application/json' },
  }, { requiredEnv: ['DB_HOST', 'GST_REGION'] }),
  'ghcr.io/fde-labs/report-worker:2.3.0': {
    routes: {}, requiredEnv: [], memoryMi: 380, cpuMilli: 140,
    binaries: [...SHELL_TOOLS, 'python'], defaultCommand: ['python', 'worker.py'],
    startupLog: () => 'INFO worker: loading 12,480 invoices for monthly GST summary\nINFO worker: building summary in memory\nINFO worker: summary ready, waiting for next batch\n',
    crashLog: () => '',
  },
  'postgres:16': {
    port: 5432, protocol: 'tcp', routes: {}, requiredEnv: ['POSTGRES_PASSWORD'], memoryMi: 42, cpuMilli: 8,
    binaries: [...SHELL_TOOLS, 'postgres', 'psql', 'pg_isready'], defaultCommand: ['postgres'],
    startupLog: () => 'PostgreSQL init process complete; ready for start up.\n2026-01-15 04:30:09.112 UTC [1] LOG:  starting PostgreSQL 16.4 on x86_64-pc-linux-gnu\n2026-01-15 04:30:09.118 UTC [1] LOG:  listening on IPv4 address "0.0.0.0", port 5432\n2026-01-15 04:30:09.131 UTC [1] LOG:  database system is ready to accept connections\n',
    crashLog: () => 'Error: Database is uninitialized and superuser password is not specified.\n       You must specify POSTGRES_PASSWORD to a non-empty value for the\n       superuser. For example, "-e POSTGRES_PASSWORD=password" on "docker run".\n',
  },
  'redis:7.2': {
    port: 6379, protocol: 'tcp', routes: {}, requiredEnv: [], memoryMi: 4, cpuMilli: 3,
    binaries: [...SHELL_TOOLS, 'redis-server', 'redis-cli'], defaultCommand: ['redis-server'],
    startupLog: () => '1:M 15 Jan 2026 04:30:07.310 * Ready to accept connections tcp\n', crashLog: () => '',
  },
  'busybox:1.36': {
    routes: {}, requiredEnv: [], memoryMi: 1, cpuMilli: 0, binaries: [...SHELL_TOOLS], defaultCommand: ['sh'], batch: true,
    startupLog: () => '', crashLog: () => '',
  },
  'registry.k8s.io/coredns/coredns:v1.11.1': {
    port: 53, protocol: 'tcp', routes: {}, requiredEnv: [], memoryMi: 18, cpuMilli: 4, binaries: ['coredns'], defaultCommand: ['/coredns'],
    startupLog: () => '.:53\nCoreDNS-1.11.1\nlinux/amd64, go1.20.7\n', crashLog: () => '',
  },
  'registry.k8s.io/ingress-nginx/controller:v1.10.1': {
    port: 80, protocol: 'http', routes: { '/healthz': { status: 200, body: 'ok' } }, requiredEnv: [], memoryMi: 92, cpuMilli: 6, binaries: ['nginx-ingress-controller'], defaultCommand: ['/nginx-ingress-controller'],
    startupLog: () => 'NGINX Ingress controller\n  Release:       v1.10.1\nI0115 04:30:06.000000       7 controller.go:190] "Configuration changes detected, backend reload required"\n', crashLog: () => '',
  },
  'registry.k8s.io/metrics-server/metrics-server:v0.7.1': {
    port: 10250, protocol: 'tcp', routes: {}, requiredEnv: [], memoryMi: 21, cpuMilli: 5, binaries: ['metrics-server'], defaultCommand: ['/metrics-server'],
    startupLog: () => 'I0115 04:30:06.000000       1 serving.go:374] Generated self-signed cert\n', crashLog: () => '',
  },
};

const NGINX_TAGS = new Set(['latest', 'stable', 'alpine', '1.25', '1.25.4', '1.26', '1.26.1', '1.27', '1.27.0', '1.27-alpine']);
const BUSYBOX_TAGS = new Set(['latest', '1.36', '1.36.1']);

/** Normalise `nginx`, `docker.io/library/nginx:1.27` etc. to a catalog key. */
export function lookupImage(image: string): ImageInfo | undefined {
  let ref = image.trim();
  ref = ref.replace(/^docker\.io\/library\//, '').replace(/^docker\.io\//, '');
  const at = ref.indexOf('@');
  if (at >= 0) ref = ref.slice(0, at);
  const slash = ref.lastIndexOf('/');
  const colon = ref.lastIndexOf(':');
  const repo = colon > slash ? ref.slice(0, colon) : ref;
  const tag = colon > slash ? ref.slice(colon + 1) : 'latest';
  if (repo === 'nginx') return NGINX_TAGS.has(tag) ? nginx : undefined;
  if (repo === 'busybox') return BUSYBOX_TAGS.has(tag) ? catalog['busybox:1.36'] : undefined;
  if (repo === 'redis' && (tag === '7.2' || tag === '7' || tag === 'latest')) return catalog['redis:7.2'];
  if (repo === 'postgres' && (tag === '16' || tag === '16.4' || tag === 'latest')) return catalog['postgres:16'];
  return catalog[repo + ':' + tag];
}

/** The fully-qualified reference containerd would try to pull. */
export function qualifiedImage(image: string): string {
  let ref = image.trim();
  const firstPart = ref.split('/')[0] ?? '';
  if (!ref.includes('/')) ref = 'docker.io/library/' + ref;
  else if (!firstPart.includes('.') && !firstPart.includes(':')) ref = 'docker.io/' + ref;
  const slash = ref.lastIndexOf('/');
  if (ref.lastIndexOf(':') < slash) ref += ':latest';
  return ref;
}

export function pullErrorMessage(image: string): string {
  const full = qualifiedImage(image);
  if (full.startsWith('ghcr.io/') && !lookupImage(image) && !Object.keys(catalog).some((key) => key.startsWith(full.slice(0, full.lastIndexOf(':'))))) {
    return 'Failed to pull image "' + image + '": failed to resolve reference "' + full + '": failed to authorize: failed to fetch anonymous token: unexpected status from GET request to https://ghcr.io/token: 403 Forbidden';
  }
  return 'Failed to pull image "' + image + '": rpc error: code = NotFound desc = failed to pull and unpack image "' + full + '": failed to resolve reference "' + full + '": ' + full + ': not found';
}
