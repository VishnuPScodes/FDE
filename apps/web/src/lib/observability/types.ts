/** Shared types for the observability simulator (logs, metrics, traces, alerts, SLOs). */

export type ScenarioKind =
  | 'baseline'
  | 'db-pool-exhaustion'
  | 'third-party-latency'
  | 'memory-leak'
  | 'bad-config'
  | 'cert-expiry';

/** Root-cause options shown in the incident report form. Includes decoys. */
export const ROOT_CAUSE_OPTIONS: readonly { id: string; label: string }[] = [
  { id: 'db-pool-exhaustion', label: 'Database connection pool exhausted' },
  { id: 'third-party-latency', label: 'Slow third-party dependency' },
  { id: 'memory-leak', label: 'Memory leak leading to restarts' },
  { id: 'bad-config', label: 'Bad configuration or feature flag change' },
  { id: 'cert-expiry', label: 'Expired TLS certificate' },
  { id: 'traffic-spike', label: 'Traffic spike beyond capacity' },
  { id: 'db-slow-query', label: 'Slow database query (missing index)' },
  { id: 'none', label: 'No incident: the service is healthy' },
];

export const SERVICE_OPTIONS: readonly string[] = ['api-gateway', 'payments', 'invoices', 'notifications'];

/** One structured JSON log line. Optional fields live in the index signature. */
export interface LogEntry {
  [field: string]: string | number;
  ts: string;
  service: string;
  level: string;
  msg: string;
}

export interface Span {
  trace_id: string;
  span_id: string;
  parent_span_id: string | null;
  name: string;
  service: string;
  kind: 'server' | 'client' | 'internal';
  /** Milliseconds since the scenario start (10:00:00). */
  start_ms: number;
  duration_ms: number;
  status: 'ok' | 'error';
  attributes: Record<string, string | number>;
}

export interface TraceSummary {
  trace_id: string;
  request_id: string;
  root_name: string;
  service: string;
  route: string;
  time: string;
  start_ms: number;
  duration_ms: number;
  status: number;
  error: boolean;
  span_count: number;
}

export interface MetricSeries {
  name: string;
  labels: Record<string, string>;
  /** One sample per minute (index 0 = 10:00). Counters are cumulative. */
  values: number[];
}

export interface Slo {
  name: string;
  service: string;
  objective: number;
  window_days: number;
  description: string;
}

export type Facts = Record<string, string | number>;

export interface Telemetry {
  kind: ScenarioKind;
  seed: number;
  minutes: number;
  /** Inclusive minute range where users were hurt; null when healthy. */
  incident: { start: number; end: number } | null;
  logs: LogEntry[];
  spans: Span[];
  traces: TraceSummary[];
  metrics: MetricSeries[];
  slos: Slo[];
  /** Hidden ground truth used by the grader. Never shown in the UI. */
  facts: Facts;
}

export type QueryKind = 'logs' | 'metrics' | 'traces';

export interface ChartSeries { label: string; values: number[] }

export interface QueryResult {
  ok: boolean;
  text: string;
  chart?: ChartSeries[];
  /** For trace lookups: spans to draw as a waterfall. */
  waterfall?: Span[];
}
