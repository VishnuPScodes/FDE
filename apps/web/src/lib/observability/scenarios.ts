import { createRng, type Rng } from './random';
import { average, clock, isoTimestamp, percentile, round } from './stats';
import type { Facts, LogEntry, MetricSeries, ScenarioKind, Slo, Span, Telemetry, TraceSummary } from './types';

/**
 * Deterministic scenario generator.
 *
 * One simulated hour (10:00–10:59 IST) of a small Indian fintech stack:
 * api-gateway → payments (UPI collect via npci-upi) and invoices (GSTIN lookup via gst-api).
 * Logs, metrics and traces are all derived from the same simulated requests, so the
 * three signals always agree with each other. Each incident leaves fingerprints in
 * the telemetry; the root cause itself is never written down anywhere visible.
 */

export const SCENARIO_KINDS: readonly ScenarioKind[] = ['baseline', 'db-pool-exhaustion', 'third-party-latency', 'memory-leak', 'bad-config', 'cert-expiry'];

export const MINUTES = 60;
const BUCKETS = [0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10, Number.POSITIVE_INFINITY];
const POOL_MAX = 20;
const MB = 1024 * 1024;

interface RouteDef { service: 'payments' | 'invoices'; method: string; route: string; perMinute: number }
const ROUTES: readonly RouteDef[] = [
  { service: 'payments', method: 'POST', route: '/v1/payments', perMinute: 60 },
  { service: 'payments', method: 'GET', route: '/v1/payments/{id}', perMinute: 30 },
  { service: 'invoices', method: 'POST', route: '/v1/invoices', perMinute: 20 },
];

const INCIDENT_WINDOWS: Record<ScenarioKind, { start: number; end: number } | null> = {
  baseline: null,
  'db-pool-exhaustion': { start: 31, end: 59 },
  'third-party-latency': { start: 20, end: 59 },
  'memory-leak': { start: 40, end: 52 },
  'bad-config': { start: 25, end: 59 },
  'cert-expiry': { start: 40, end: 59 },
};

const INCIDENT_SERVICE: Record<ScenarioKind, string> = {
  baseline: 'none',
  'db-pool-exhaustion': 'payments',
  'third-party-latency': 'invoices',
  'memory-leak': 'payments',
  'bad-config': 'payments',
  'cert-expiry': 'payments',
};

interface ChildPlan { name: string; kind: 'client' | 'internal'; duration: number; status: 'ok' | 'error'; attributes: Record<string, string | number> }
interface RequestOutcome {
  status: number;
  children: ChildPlan[];
  /** Extra server self-time (for example, garbage collection pauses). */
  selfMs: number;
  error?: { msg: string; peer?: string; error_type: string };
  warn?: LogEntry;
  /** True when the gateway could not reach the service at all. */
  unreachable?: boolean;
}

class MetricStore {
  private readonly increments = new Map<string, { name: string; labels: Record<string, string>; values: number[] }>();
  private readonly gauges = new Map<string, { name: string; labels: Record<string, string>; values: number[] }>();

  private key(name: string, labels: Record<string, string>): string {
    return name + JSON.stringify(Object.entries(labels).sort(([a], [b]) => a.localeCompare(b)));
  }

  inc(name: string, labels: Record<string, string>, minute: number, amount = 1): void {
    const key = this.key(name, labels);
    let entry = this.increments.get(key);
    if (!entry) {
      entry = { name, labels, values: new Array<number>(MINUTES).fill(0) };
      this.increments.set(key, entry);
    }
    entry.values[minute] = (entry.values[minute] ?? 0) + amount;
  }

  observe(base: string, labels: Record<string, string>, minute: number, seconds: number): void {
    for (const bound of BUCKETS) {
      if (seconds <= bound) this.inc(base + '_bucket', { ...labels, le: bound === Number.POSITIVE_INFINITY ? '+Inf' : String(bound) }, minute);
      else this.inc(base + '_bucket', { ...labels, le: bound === Number.POSITIVE_INFINITY ? '+Inf' : String(bound) }, minute, 0);
    }
    this.inc(base + '_sum', labels, minute, seconds);
    this.inc(base + '_count', labels, minute);
  }

  gauge(name: string, labels: Record<string, string>, minute: number, value: number): void {
    const key = this.key(name, labels);
    let entry = this.gauges.get(key);
    if (!entry) {
      entry = { name, labels, values: new Array<number>(MINUTES).fill(0) };
      this.gauges.set(key, entry);
    }
    entry.values[minute] = value;
  }

  series(): MetricSeries[] {
    const out: MetricSeries[] = [];
    for (const entry of this.increments.values()) {
      let total = 0;
      out.push({ name: entry.name, labels: entry.labels, values: entry.values.map((value) => (total = round(total + value, 6))) });
    }
    for (const entry of this.gauges.values()) out.push({ name: entry.name, labels: entry.labels, values: [...entry.values] });
    return out.sort((a, b) => (a.name + JSON.stringify(a.labels)).localeCompare(b.name + JSON.stringify(b.labels)));
  }
}

const cache = new Map<string, Telemetry>();

/** Generate (or reuse) the telemetry for a scenario + seed. Pure and deterministic. */
export function generateScenario(kind: ScenarioKind, seed: number): Telemetry {
  const cacheKey = kind + ':' + String(seed);
  const cached = cache.get(cacheKey);
  if (cached) return cached;
  const telemetry = buildScenario(kind, seed);
  cache.set(cacheKey, telemetry);
  return telemetry;
}

export function isScenarioKind(value: string): value is ScenarioKind {
  return (SCENARIO_KINDS as readonly string[]).includes(value);
}

function buildScenario(kind: ScenarioKind, seed: number): Telemetry {
  const rng = createRng(seed * 7919 + SCENARIO_KINDS.indexOf(kind) * 104729 + 17);
  const logs: LogEntry[] = [];
  const spans: Span[] = [];
  const traces: TraceSummary[] = [];
  const metrics = new MetricStore();
  const incident = INCIDENT_WINDOWS[kind];
  let featured: TraceSummary | undefined;
  let featuredPeer = '';

  // Change events that an engineer would look for first.
  if (kind === 'db-pool-exhaustion') logs.push(eventLog(30 * 60000 + 4000, 'payments', 'info', 'deploy finished', { version: '2.4.1', commit: '9c1e7ab', deployed_by: 'github-actions' }));
  if (kind === 'memory-leak') logs.push(eventLog(5 * 60000 + 2000, 'payments', 'info', 'deploy finished', { version: '3.1.0', commit: '41d0be2', deployed_by: 'github-actions' }));
  if (kind === 'third-party-latency') logs.push(eventLog(15 * 60000 + 9000, 'notifications', 'info', 'deploy finished', { version: '1.9.4', commit: 'a77f210', deployed_by: 'github-actions' }));
  if (kind === 'bad-config') logs.push(eventLog(25 * 60000 + 1000, 'payments', 'info', 'config reloaded', { source: 'configmap/payments-flags', flags: 'upi_retry_v2=on npci_timeout_ms=200', changed_by: 'rajesh.k' }));
  if (kind === 'memory-leak') {
    logs.push(eventLog(51 * 60000 + 200, 'payments', 'error', 'container terminated', { reason: 'OOMKilled', exit_code: 137, memory_limit_mb: 768, pod: 'payments-7d9f6c-x2kqp' }));
    logs.push(eventLog(53 * 60000 + 100, 'payments', 'info', 'container started', { version: '3.1.0', pod: 'payments-7d9f6c-x2kqp', restart_count: 1 }));
  }
  if (kind === 'cert-expiry') {
    logs.push(eventLog(10 * 60000 + 500, 'payments', 'warn', 'tls client certificate expires soon', { peer: 'npci-upi', expires_in_s: 1800 }));
    logs.push(eventLog(30 * 60000 + 500, 'payments', 'warn', 'tls client certificate expires soon', { peer: 'npci-upi', expires_in_s: 600 }));
  }

  for (let minute = 0; minute < MINUTES; minute += 1) {
    let blipBudget = minute === 8 ? 6 : minute === 14 ? 10 : 0;
    const requests: { route: RouteDef; at: number }[] = [];
    for (const route of ROUTES) {
      const count = route.perMinute + rng.int(-Math.round(route.perMinute / 15), Math.round(route.perMinute / 15));
      for (let index = 0; index < count; index += 1) requests.push({ route, at: minute * 60000 + rng.int(0, 59999) });
    }
    requests.sort((a, b) => a.at - b.at);

    for (const request of requests) {
      const { route, at } = request;
      const forcedBlip = blipBudget > 0 && route.method === 'POST' && route.service === 'payments';
      if (forcedBlip) blipBudget -= 1;
      const outcome = simulate(kind, rng, route, minute, forcedBlip);
      const traceId = rng.hex(32);
      const requestId = 'req-' + rng.hex(8);
      const gatewaySpanId = rng.hex(16);
      const serviceSpanId = rng.hex(16);
      const gatewayOverhead = rng.int(2, 6);

      // Lay out child spans sequentially inside the service span.
      let cursor = at + gatewayOverhead + 1;
      const childSpans: Span[] = [];
      if (!outcome.unreachable) {
        cursor += Math.round(outcome.selfMs / 2);
        for (const child of outcome.children) {
          childSpans.push({ trace_id: traceId, span_id: rng.hex(16), parent_span_id: serviceSpanId, name: child.name, service: route.service, kind: child.kind, start_ms: cursor, duration_ms: child.duration, status: child.status, attributes: child.attributes });
          cursor += child.duration + 1;
        }
        cursor += Math.round(outcome.selfMs / 2) + rng.int(1, 4);
      }
      const serviceLatency = outcome.unreachable ? 0 : cursor - (at + gatewayOverhead);
      const gatewayLatency = outcome.unreachable ? rng.int(1, 4) + gatewayOverhead : serviceLatency + gatewayOverhead + 1;
      const status = outcome.status;
      const name = route.method + ' ' + route.route;

      spans.push({ trace_id: traceId, span_id: gatewaySpanId, parent_span_id: null, name, service: 'api-gateway', kind: 'server', start_ms: at, duration_ms: gatewayLatency, status: status >= 500 ? 'error' : 'ok', attributes: { 'http.method': route.method, 'http.route': route.route, 'http.status_code': status, 'request.id': requestId } });
      if (outcome.unreachable) {
        spans.push({ trace_id: traceId, span_id: serviceSpanId, parent_span_id: gatewaySpanId, name: 'connect ' + route.service, service: 'api-gateway', kind: 'client', start_ms: at + 1, duration_ms: gatewayLatency - 2, status: 'error', attributes: { 'peer.service': route.service, 'error.message': 'connection refused' } });
      } else {
        spans.push({ trace_id: traceId, span_id: serviceSpanId, parent_span_id: gatewaySpanId, name, service: route.service, kind: 'server', start_ms: at + gatewayOverhead, duration_ms: serviceLatency, status: status >= 500 ? 'error' : 'ok', attributes: { 'http.method': route.method, 'http.route': route.route, 'http.status_code': status, 'service.version': serviceVersion(kind, route.service, minute) } });
        spans.push(...childSpans);
      }

      const common = { request_id: requestId, trace_id: traceId, method: route.method, route: route.route };
      logs.push({ ts: isoTimestamp(at + gatewayLatency), service: 'api-gateway', level: 'info', msg: 'request completed', ...common, status, latency_ms: gatewayLatency, upstream: route.service });
      if (!outcome.unreachable) {
        logs.push({ ts: isoTimestamp(at + gatewayOverhead + serviceLatency), service: route.service, level: 'info', msg: 'request completed', ...common, status, latency_ms: serviceLatency });
      }
      if (outcome.warn) logs.push({ ...outcome.warn, ...common });
      if (outcome.error) {
        const entry: LogEntry = { ts: isoTimestamp(at + gatewayOverhead + Math.max(serviceLatency - 1, 0)), service: outcome.unreachable ? 'api-gateway' : route.service, level: 'error', msg: outcome.error.msg, ...common, status, error_type: outcome.error.error_type };
        if (outcome.error.peer) entry.peer = outcome.error.peer;
        logs.push(entry);
      }

      const serviceSpanCount = outcome.unreachable ? 2 : 2 + childSpans.length;
      const summary: TraceSummary = { trace_id: traceId, request_id: requestId, root_name: name, service: route.service, route: route.route, time: clock(at), start_ms: at, duration_ms: gatewayLatency, status, error: status >= 500, span_count: serviceSpanCount };
      traces.push(summary);
      const featuredService = kind === 'baseline' ? 'payments' : INCIDENT_SERVICE[kind];
      if (!featured && status >= 500 && route.service === featuredService && route.method === 'POST' && (incident ? minute >= incident.start : minute === 8)) {
        featured = summary;
        featuredPeer = outcome.error?.peer ?? '';
      }

      // RED metrics, recorded by both the gateway and the owning service.
      const statusLabel = String(status);
      metrics.inc('http_requests_total', { service: 'api-gateway', method: route.method, route: route.route, status: statusLabel }, minute);
      metrics.observe('http_request_duration_seconds', { service: 'api-gateway', route: route.route }, minute, gatewayLatency / 1000);
      if (!outcome.unreachable) {
        metrics.inc('http_requests_total', { service: route.service, method: route.method, route: route.route, status: statusLabel }, minute);
        metrics.observe('http_request_duration_seconds', { service: route.service, route: route.route }, minute, serviceLatency / 1000);
      }
      for (const child of outcome.children) {
        const peer = child.attributes['peer.service'];
        if (child.kind !== 'client' || typeof peer !== 'string' || outcome.unreachable) continue;
        metrics.inc('http_client_requests_total', { service: route.service, peer, outcome: child.status === 'ok' ? 'success' : 'error' }, minute);
        metrics.observe('http_client_request_duration_seconds', { service: route.service, peer }, minute, child.duration / 1000);
      }
    }

    recordGauges(kind, rng, metrics, minute);
  }

  logs.sort((a, b) => a.ts.localeCompare(b.ts));
  traces.sort((a, b) => a.start_ms - b.start_ms);
  const metricSeries = metrics.series();
  const slos: Slo[] = [
    { name: 'payments-availability', service: 'payments', objective: 0.999, window_days: 30, description: '99.9% of payments API requests return a non-5xx status over 30 days.' },
    { name: 'invoices-latency', service: 'invoices', objective: 0.95, window_days: 30, description: '95% of invoice requests finish within 1 second over 30 days.' },
  ];
  const facts = computeFacts(kind, logs, spans, traces, metricSeries, featured, featuredPeer);
  return { kind, seed, minutes: MINUTES, incident, logs, spans, traces, metrics: metricSeries, slos, facts };
}

function eventLog(ms: number, service: string, level: string, msg: string, extra: Record<string, string | number>): LogEntry {
  return { ts: isoTimestamp(ms), service, level, msg, ...extra };
}

function serviceVersion(kind: ScenarioKind, service: string, minute: number): string {
  if (service === 'payments') {
    if (kind === 'db-pool-exhaustion') return minute >= 30 ? '2.4.1' : '2.4.0';
    if (kind === 'memory-leak') return minute >= 5 ? '3.1.0' : '3.0.9';
    return '2.4.0';
  }
  return '1.12.3';
}

function dbSpan(rng: Rng, statement: string, min: number, max: number): ChildPlan {
  return { name: `${statement.split(' ')[0] ?? ''} ${statement.match(/(?:INTO|FROM|UPDATE)\s+(\w+)/)?.[1] ?? 'db'}`, kind: 'client', duration: rng.int(min, max), status: 'ok', attributes: { 'db.system': 'postgresql', 'db.statement': statement, 'peer.service': 'postgres' } };
}

function simulate(kind: ScenarioKind, rng: Rng, route: RouteDef, minute: number, forcedBlip: boolean): RequestOutcome {
  const children: ChildPlan[] = [];
  let selfMs = rng.int(1, 6);

  if (route.service === 'invoices') {
    children.push(dbSpan(rng, 'SELECT * FROM customers WHERE gstin = $1', 3, 10));
    if (rng.next() < 0.04) {
      return { status: 422, children, selfMs, error: undefined };
    }
    const slow = kind === 'third-party-latency' && minute >= 20;
    const gstLatency = slow ? rng.int(2500, 9800) : rng.int(120, 400);
    const timedOut = gstLatency >= 8000;
    const gstDuration = timedOut ? 8000 : gstLatency;
    children.push({ name: 'GET gst-api /taxpayers/{gstin}', kind: 'client', duration: gstDuration, status: timedOut ? 'error' : 'ok', attributes: { 'peer.service': 'gst-api', 'http.method': 'GET', 'http.url': 'https://gst-api.partner.in/taxpayers/{gstin}', 'http.status_code': timedOut ? 0 : 200 } });
    if (timedOut) {
      return { status: 504, children, selfMs, error: { msg: 'gst-api request timed out after 8000ms', peer: 'gst-api', error_type: 'UpstreamTimeout' } };
    }
    children.push(dbSpan(rng, 'INSERT INTO invoices (gstin, amount_paise) VALUES ($1, $2)', 5, 15));
    const warn: LogEntry | undefined = gstLatency > 2000 ? { ts: isoTimestamp(minute * 60000), service: 'invoices', level: 'warn', msg: 'slow upstream response', peer: 'gst-api', upstream_latency_ms: gstLatency } : undefined;
    return warn ? { status: 201, children, selfMs, warn } : { status: 201, children, selfMs };
  }

  // payments service
  if (kind === 'memory-leak' && (minute === 51 || minute === 52)) {
    return { status: 502, children: [], selfMs: 0, unreachable: true, error: { msg: 'upstream connect error: connection refused', peer: 'payments', error_type: 'UpstreamUnavailable' } };
  }
  if (kind === 'memory-leak' && minute >= 40 && minute <= 50) {
    selfMs += Math.round(rng.int(150, 900) * ((minute - 39) / 11));
  }

  // Connection pool acquire.
  let acquire = rng.int(0, 2);
  let poolTimeout = false;
  if (kind === 'db-pool-exhaustion' && minute >= 30) {
    if (minute >= 33) {
      acquire = rng.int(800, 6500);
      if (acquire >= 5000) { acquire = 5000; poolTimeout = true; }
    } else if (minute >= 31) {
      acquire = rng.int(100, 1500);
    }
  }
  children.push({ name: 'db.pool.acquire', kind: 'internal', duration: acquire, status: poolTimeout ? 'error' : 'ok', attributes: { 'db.pool.max': POOL_MAX, 'db.system': 'postgresql' } });
  if (poolTimeout) {
    return { status: 503, children, selfMs, error: { msg: 'timed out acquiring db connection from pool (max=20, wait_ms=5000)', peer: 'postgres', error_type: 'PoolTimeout' } };
  }

  if (route.method === 'GET') {
    children.push(dbSpan(rng, 'SELECT status FROM upi_transactions WHERE id = $1', 2, 8));
    if (rng.next() < 0.03) return { status: 404, children, selfMs };
    return { status: 200, children, selfMs };
  }

  children.push(dbSpan(rng, 'INSERT INTO upi_transactions (vpa, amount_paise) VALUES ($1, $2)', 5, 20));
  const base = rng.int(120, 320);
  if (forcedBlip) {
    children.push(npciSpan(rng.int(30, 60), 'error', 503));
    return { status: 503, children, selfMs, error: { msg: 'npci-upi returned 503 service unavailable', peer: 'npci-upi', error_type: 'UpstreamError' } };
  }
  if (kind === 'bad-config' && minute >= 25 && base > 200) {
    children.push(npciSpan(200, 'error', 0));
    return { status: 502, children, selfMs, error: { msg: 'npci collect failed: context deadline exceeded (timeout_ms=200)', peer: 'npci-upi', error_type: 'DeadlineExceeded' } };
  }
  if (kind === 'cert-expiry' && minute >= 40) {
    children.push(npciSpan(rng.int(8, 20), 'error', 0));
    return { status: 502, children, selfMs, error: { msg: 'tls handshake failed: x509: certificate has expired or is not yet valid', peer: 'npci-upi', error_type: 'TlsError' } };
  }
  if (rng.next() < 0.001) {
    children.push(npciSpan(base, 'ok', 200));
    return { status: 500, children, selfMs, error: { msg: 'ledger write failed: deadlock detected', peer: 'postgres', error_type: 'DbError' } };
  }
  children.push(npciSpan(base, 'ok', 200));
  return { status: 201, children, selfMs };
}

function npciSpan(duration: number, status: 'ok' | 'error', httpStatus: number): ChildPlan {
  return { name: 'POST npci-upi /collect', kind: 'client', duration, status, attributes: { 'peer.service': 'npci-upi', 'http.method': 'POST', 'http.status_code': httpStatus } };
}

function recordGauges(kind: ScenarioKind, rng: Rng, metrics: MetricStore, minute: number): void {
  const noise = (spread: number) => (rng.next() - 0.5) * spread;
  // CPU
  let paymentsCpu = 0.28 + noise(0.06);
  if (kind === 'memory-leak' && minute >= 40 && minute <= 50) paymentsCpu = 0.55 + (minute - 40) * 0.035 + noise(0.04);
  metrics.gauge('process_cpu_usage', { service: 'payments' }, minute, round(paymentsCpu, 3));
  metrics.gauge('process_cpu_usage', { service: 'invoices' }, minute, round(0.16 + noise(0.04), 3));
  metrics.gauge('process_cpu_usage', { service: 'api-gateway' }, minute, round(0.11 + noise(0.03), 3));
  // Memory
  let paymentsMb = 310 + noise(12);
  if (kind === 'memory-leak') {
    if (minute >= 5 && minute <= 50) paymentsMb = 310 + (minute - 5) * 10 + noise(6);
    else if (minute >= 51) paymentsMb = 300 + Math.max(0, minute - 52) * 10 + noise(6);
  }
  metrics.gauge('process_resident_memory_bytes', { service: 'payments' }, minute, Math.round(paymentsMb * MB));
  metrics.gauge('process_resident_memory_bytes', { service: 'invoices' }, minute, Math.round((220 + noise(10)) * MB));
  metrics.gauge('process_resident_memory_bytes', { service: 'api-gateway' }, minute, Math.round((140 + noise(6)) * MB));
  for (const service of ['payments', 'invoices', 'api-gateway']) metrics.gauge('container_memory_limit_bytes', { service }, minute, 768 * MB);
  // Restarts (counter, recorded as increments)
  metrics.inc('kube_pod_container_restarts_total', { service: 'payments' }, minute, kind === 'memory-leak' && minute === 51 ? 1 : 0);
  metrics.inc('kube_pod_container_restarts_total', { service: 'invoices' }, minute, 0);
  // DB pool
  let inUse = rng.int(3, 6);
  if (kind === 'db-pool-exhaustion' && minute >= 30) inUse = Math.min(POOL_MAX, 6 + (minute - 29) * 5);
  metrics.gauge('db_pool_connections_in_use', { service: 'payments' }, minute, inUse);
  metrics.gauge('db_pool_connections_in_use', { service: 'invoices' }, minute, rng.int(2, 4));
  metrics.gauge('db_pool_connections_max', { service: 'payments' }, minute, POOL_MAX);
  metrics.gauge('db_pool_connections_max', { service: 'invoices' }, minute, POOL_MAX);
  // Certificate expiry (seconds until the npci-upi client certificate expires)
  const expirySeconds = kind === 'cert-expiry' ? (40 - minute) * 60 : 41 * 86400 - minute * 60;
  metrics.gauge('tls_client_cert_expiry_seconds', { service: 'payments', peer: 'npci-upi' }, minute, expirySeconds);
  metrics.gauge('tls_client_cert_expiry_seconds', { service: 'invoices', peer: 'gst-api' }, minute, 63 * 86400 - minute * 60);
}

function computeFacts(kind: ScenarioKind, logs: LogEntry[], spans: Span[], traces: TraceSummary[], metrics: MetricSeries[], featured: TraceSummary | undefined, featuredPeer: string): Facts {
  const facts: Facts = { root_cause: kind === 'baseline' ? 'none' : kind, incident_service: INCIDENT_SERVICE[kind] };
  if (featured) {
    facts.featured_request_id = featured.request_id;
    facts.featured_trace_id = featured.trace_id;
    facts.featured_status = featured.status;
    facts.featured_peer = featuredPeer;
    facts.featured_time = featured.time;
  }
  for (const service of ['payments', 'invoices']) {
    const errors = logs.filter((log) => log.service === service && log.level === 'error' && typeof log.status === 'number');
    const counts = new Map<string, number>();
    for (const log of errors) counts.set(String(log.status), (counts.get(String(log.status)) ?? 0) + 1);
    const top = [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0];
    facts[service + '_error_count'] = errors.length;
    if (top) { facts[service + '_top_error_status'] = top[0]; facts[service + '_top_error_status_count'] = top[1]; }
    const latencies = logs.filter((log) => log.service === service && typeof log.latency_ms === 'number').map((log) => Number(log.latency_ms));
    facts[service + '_avg_latency_ms'] = round(average(latencies), 1);
    facts[service + '_p50_latency_ms'] = percentile(latencies, 50);
    facts[service + '_p95_latency_ms'] = percentile(latencies, 95);
    facts[service + '_p99_latency_ms'] = percentile(latencies, 99);

    const requestSeries = metrics.filter((series) => series.name === 'http_requests_total' && series.labels.service === service);
    const window = (series: MetricSeries) => (series.values[MINUTES - 1] ?? 0) - (series.values[MINUTES - 6] ?? 0);
    const total5m = requestSeries.reduce((sum, series) => sum + window(series), 0);
    const errors5m = requestSeries.filter((series) => (series.labels.status ?? '').startsWith('5')).reduce((sum, series) => sum + window(series), 0);
    facts[service + '_rps_5m'] = round(total5m / 300, 3);
    facts[service + '_error_pct_5m'] = round(total5m ? (errors5m / total5m) * 100 : 0, 2);
    const totalHour = requestSeries.reduce((sum, series) => sum + (series.values[MINUTES - 1] ?? 0), 0);
    const errorsHour = requestSeries.filter((series) => (series.labels.status ?? '').startsWith('5')).reduce((sum, series) => sum + (series.values[MINUTES - 1] ?? 0), 0);
    facts[service + '_error_ratio_1h'] = round(totalHour ? errorsHour / totalHour : 0, 5);
    facts[service + '_burn_rate_1h'] = round(totalHour ? errorsHour / totalHour / 0.001 : 0, 2);
  }
  const slowest = [...traces].sort((a, b) => b.duration_ms - a.duration_ms)[0];
  if (slowest) {
    facts.slowest_trace_id = slowest.trace_id;
    facts.slowest_trace_ms = slowest.duration_ms;
    const inner = spans.filter((span) => span.trace_id === slowest.trace_id && span.kind !== 'server').sort((a, b) => b.duration_ms - a.duration_ms)[0];
    if (inner) { facts.slowest_span_name = inner.name; facts.slowest_span_service = inner.service; facts.slowest_span_peer = String(inner.attributes['peer.service'] ?? ''); }
  }
  facts.error_budget_minutes_30d = 43.2;
  return facts;
}
