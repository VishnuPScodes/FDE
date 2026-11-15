import { evaluatePromQL, PromQLError } from './promql';
import { round } from './stats';
import type { MetricSeries, Slo, Telemetry } from './types';

export interface AlertRule { name: string; expr: string; forMinutes: number; severity: string }

export interface AlertEvaluation {
  valid: boolean;
  error: string;
  rule: AlertRule | null;
  /** Condition true at each minute (before the `for` duration is applied). */
  pending: boolean[];
  /** Alert firing at each minute. */
  firing: boolean[];
  episodes: { start: number; end: number }[];
  firesDuringIncident: boolean;
  falsePositives: number;
  /** Minutes from incident start to first firing inside the incident, or -1. */
  detectionDelay: number;
}

/** Parse a Prometheus-style rule written as simple `key: value` lines. */
export function parseAlertRule(source: string): { rule: AlertRule | null; error: string } {
  const fields: Record<string, string> = {};
  let currentKey = '';
  for (const rawLine of source.split(/\r?\n/)) {
    const line = rawLine.replace(/^\s*-\s+/, '').trimEnd();
    if (!line.trim() || line.trim().startsWith('#')) continue;
    const match = /^\s*([a-zA-Z_]+)\s*:\s?(.*)$/.exec(line);
    if (match && ['alert', 'expr', 'for', 'severity', 'labels', 'annotations', 'summary'].includes(match[1]!)) {
      currentKey = match[1]!;
      fields[currentKey] = (match[2] ?? '').trim().replace(/^["'](.*)["']$/, '$1');
    } else if (currentKey === 'expr') {
      fields.expr = (fields.expr ?? '') + ' ' + line.trim();
    } else if (/^\s+severity\s*:/.test(line)) {
      fields.severity = line.split(':')[1]?.trim() ?? '';
    }
  }
  const expr = (fields.expr ?? '').replace(/^[>|]-?\s*/, '').trim();
  if (!expr) return { rule: null, error: 'The rule needs an expr: line with a PromQL condition.' };
  const forText = (fields.for ?? '0m').trim();
  const forMatch = /^(\d+)([smh])$/.exec(forText);
  if (!forMatch) return { rule: null, error: 'for: must look like 5m, 10m or 1h (got "' + forText + '").' };
  const amount = Number(forMatch[1]);
  const forMinutes = forMatch[2] === 's' ? Math.ceil(amount / 60) : forMatch[2] === 'h' ? amount * 60 : amount;
  // eslint-disable-next-line @typescript-eslint/prefer-nullish-coalescing -- empty string must fall back as well as undefined (empty field uses default)
  return { rule: { name: fields.alert || 'UnnamedAlert', expr, forMinutes, severity: fields.severity || 'page' }, error: '' };
}

export function evaluateAlert(telemetry: Telemetry, source: string): AlertEvaluation {
  const empty: AlertEvaluation = { valid: false, error: '', rule: null, pending: [], firing: [], episodes: [], firesDuringIncident: false, falsePositives: 0, detectionDelay: -1 };
  const parsed = parseAlertRule(source);
  if (!parsed.rule) return { ...empty, error: parsed.error };
  let pending: boolean[];
  try {
    const value = evaluatePromQL(parsed.rule.expr, telemetry.metrics, telemetry.minutes);
    if (value.type === 'scalar') return { ...empty, rule: parsed.rule, error: 'The expr evaluates to a plain number. Alert conditions need a metric, such as rate(...) > 0.05.' };
    if (value.type === 'range') return { ...empty, rule: parsed.rule, error: 'The expr is a range selector. Wrap it in rate(...) and compare it with a threshold.' };
    pending = Array.from({ length: telemetry.minutes }, (_, minute) => value.series.some((series) => Number.isFinite(series.values[minute] ?? Number.NaN)));
  } catch (error) {
    return { ...empty, rule: parsed.rule, error: error instanceof PromQLError ? error.message : 'Could not evaluate the expression.' };
  }
  const firing: boolean[] = [];
  let run = 0;
  for (const active of pending) {
    run = active ? run + 1 : 0;
    firing.push(active && run >= parsed.rule.forMinutes + 1);
  }
  const episodes: { start: number; end: number }[] = [];
  firing.forEach((active, minute) => {
    const last = episodes[episodes.length - 1];
    if (!active) return;
    if (last?.end === minute - 1) last.end = minute;
    else episodes.push({ start: minute, end: minute });
  });
  const incident = telemetry.incident;
  const overlaps = (episode: { start: number; end: number }) => Boolean(incident && episode.end >= incident.start && episode.start <= incident.end);
  const firstInIncident = incident ? firing.findIndex((active, minute) => active && minute >= incident.start && minute <= incident.end) : -1;
  return {
    valid: true,
    error: '',
    rule: parsed.rule,
    pending,
    firing,
    episodes,
    firesDuringIncident: firstInIncident >= 0,
    falsePositives: episodes.filter((episode) => !overlaps(episode)).length,
    detectionDelay: firstInIncident >= 0 && incident ? firstInIncident - incident.start : -1,
  };
}

/** Built-in rules shown on the Alerts tab, like an on-call notification feed. */
export const BUILT_IN_RULES: readonly string[] = [
  'alert: PaymentsHighErrorRate\nexpr: sum(rate(http_requests_total{service="payments",status=~"5.."}[5m])) / sum(rate(http_requests_total{service="payments"}[5m])) > 0.05\nfor: 5m\nseverity: page',
  'alert: GatewayHighErrorRate\nexpr: sum(rate(http_requests_total{service="api-gateway",status=~"5.."}[5m])) / sum(rate(http_requests_total{service="api-gateway"}[5m])) > 0.05\nfor: 5m\nseverity: page',
  'alert: InvoicesSlowP95\nexpr: histogram_quantile(0.95, sum by (le) (rate(http_request_duration_seconds_bucket{service="invoices"}[5m]))) > 2\nfor: 10m\nseverity: ticket',
  'alert: PaymentsCpuHigh\nexpr: process_cpu_usage{service="payments"} > 0.8\nfor: 5m\nseverity: ticket',
];

export interface SloStatus {
  slo: Slo;
  badRatio1h: number;
  badRatio5m: number;
  burnRate1h: number;
  burnRate5m: number;
  /** Share of the whole 30-day error budget spent in this one hour (percent). */
  budgetSpentPct: number;
}

function windowSum(series: readonly MetricSeries[], from: number, to: number): number {
  return series.reduce((sum, item) => sum + (item.values[to] ?? 0) - (from >= 0 ? item.values[from] ?? 0 : 0), 0);
}

export function sloStatus(telemetry: Telemetry): SloStatus[] {
  const last = telemetry.minutes - 1;
  return telemetry.slos.map((slo) => {
    let bad = (from: number) => 0 * from;
    let total = (from: number) => 0 * from;
    if (slo.name.endsWith('availability')) {
      const all = telemetry.metrics.filter((series) => series.name === 'http_requests_total' && series.labels.service === slo.service);
      const errors = all.filter((series) => (series.labels.status ?? '').startsWith('5'));
      bad = (from) => windowSum(errors, from, last);
      total = (from) => windowSum(all, from, last);
    } else {
      const count = telemetry.metrics.filter((series) => series.name === 'http_request_duration_seconds_count' && series.labels.service === slo.service);
      const fast = telemetry.metrics.filter((series) => series.name === 'http_request_duration_seconds_bucket' && series.labels.service === slo.service && series.labels.le === '1');
      bad = (from) => windowSum(count, from, last) - windowSum(fast, from, last);
      total = (from) => windowSum(count, from, last);
    }
    const allowed = 1 - slo.objective;
    const ratio = (from: number) => { const denominator = total(from); return denominator > 0 ? bad(from) / denominator : 0; };
    const badRatio1h = ratio(-1);
    const badRatio5m = ratio(last - 5);
    const burnRate1h = badRatio1h / allowed;
    return {
      slo,
      badRatio1h: round(badRatio1h, 5),
      badRatio5m: round(badRatio5m, 5),
      burnRate1h: round(burnRate1h, 2),
      burnRate5m: round(badRatio5m / allowed, 2),
      budgetSpentPct: round((burnRate1h / (slo.window_days * 24)) * 100, 2),
    };
  });
}
