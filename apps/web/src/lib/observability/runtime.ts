import { LogQueryError, runLogQuery } from './log-query';
import { evaluatePromQL, formatLabels, PromQLError } from './promql';
import { generateScenario, isScenarioKind } from './scenarios';
import { clockMinute, formatNumber } from './stats';
import { runTraceQuery } from './traces';
import type { QueryKind, QueryResult, ScenarioKind, Telemetry } from './types';

export interface IncidentReport { rootCause: string; service: string; evidence: string }

/** Everything the learner has done in an observability level. Serialisable to JSON. */
export interface ObservabilityState {
  scenario: ScenarioKind;
  seed: number;
  /** Queries run, as "logs> ...", "metrics> ..." or "traces> ...". */
  history: string[];
  lastOutput: string;
  lastError: string;
  report: IncidentReport;
  answers: Record<string, string>;
  alertRule: string;
}

export interface ScenarioConfig { scenario: ScenarioKind; seed: number }

export const SCENARIO_FILE = 'scenario.json';
export const ALERT_FILE = 'alert-rule.yaml';

/** Read the scenario from the level's scenario.json starter file. */
export function parseScenarioConfig(files: Record<string, string>): ScenarioConfig {
  const raw = files[SCENARIO_FILE];
  if (!raw) return { scenario: 'baseline', seed: 1 };
  try {
    const parsed = JSON.parse(raw) as { scenario?: unknown; seed?: unknown };
    const scenario = typeof parsed.scenario === 'string' && isScenarioKind(parsed.scenario) ? parsed.scenario : 'baseline';
    const seed = typeof parsed.seed === 'number' && Number.isFinite(parsed.seed) ? parsed.seed : 1;
    return { scenario, seed };
  } catch {
    return { scenario: 'baseline', seed: 1 };
  }
}

export function createObservabilityState(config: ScenarioConfig, alertRule = ''): ObservabilityState {
  return { scenario: config.scenario, seed: config.seed, history: [], lastOutput: '', lastError: '', report: { rootCause: '', service: '', evidence: '' }, answers: {}, alertRule };
}

export function telemetryFor(state: Pick<ObservabilityState, 'scenario' | 'seed'>): Telemetry {
  return generateScenario(state.scenario, state.seed);
}

export function runMetricQuery(telemetry: Telemetry, query: string): QueryResult {
  const value = evaluatePromQL(query, telemetry.metrics, telemetry.minutes);
  if (value.type === 'scalar') return { ok: true, text: 'scalar ' + formatNumber(value.value) };
  if (value.type === 'range') {
    return { ok: true, text: 'A range selector returns raw samples. Wrap it in a function such as rate(' + query.trim() + ') to graph it.\n' + String(value.series.length) + ' matching series.' };
  }
  const series = value.series.filter((item) => item.values.some((sample) => Number.isFinite(sample)));
  if (series.length === 0) return { ok: true, text: 'Empty result: no series matched at any minute between 10:00 and 10:59.', chart: [] };
  const lines = series.slice(0, 25).map((item) => {
    const finite = item.values.map((sample, minute) => ({ sample, minute })).filter((entry) => Number.isFinite(entry.sample));
    const peak = finite.reduce((best, entry) => (entry.sample > best.sample ? entry : best), finite[0]!);
    const now = item.values[item.values.length - 1];
    return formatLabels(item.labels) + '\n    now (10:59) = ' + (now === undefined || Number.isNaN(now) ? 'no value' : formatNumber(now)) + '   max = ' + formatNumber(peak.sample) + ' at ' + clockMinute(peak.minute) + '   min = ' + formatNumber(Math.min(...finite.map((entry) => entry.sample)));
  });
  const more = series.length > 25 ? '\n… ' + String(series.length - 25) + ' more series. Aggregate with sum by (...) to reduce them.' : '';
  return { ok: true, text: String(series.length) + ' series\n' + lines.join('\n') + more, chart: series.slice(0, 8).map((item) => ({ label: formatLabels(item.labels), values: item.values })) };
}

/** Run one query against the scenario. Never throws: errors come back as text. */
export function runObservabilityQuery(state: ObservabilityState, kind: QueryKind, query: string): { state: ObservabilityState; result: QueryResult } {
  const trimmed = query.trim();
  const telemetry = telemetryFor(state);
  let result: QueryResult;
  try {
    if (kind === 'logs') result = runLogQuery(telemetry.logs, trimmed, telemetry.minutes);
    else if (kind === 'metrics') result = runMetricQuery(telemetry, trimmed);
    else result = runTraceQuery(telemetry, trimmed);
  } catch (error) {
    const message = error instanceof LogQueryError || error instanceof PromQLError ? error.message : 'Query failed: ' + (error instanceof Error ? error.message : String(error));
    result = { ok: false, text: message };
  }
  const entry = kind + '> ' + trimmed;
  const next: ObservabilityState = {
    ...state,
    history: [...state.history, entry].slice(-200),
    lastOutput: result.ok ? result.text : '',
    lastError: result.ok ? '' : result.text,
  };
  return { state: next, result };
}

/** Replay a saved session (used by tests and the content checker). */
export function replaySession(config: ScenarioConfig, session: { history?: string[]; report?: Partial<IncidentReport>; answers?: Record<string, string>; alertRule?: string }): ObservabilityState {
  let state = createObservabilityState(config, session.alertRule ?? '');
  for (const line of session.history ?? []) {
    const match = /^(logs|metrics|traces)>\s?(.*)$/.exec(line);
    if (!match) continue;
    state = runObservabilityQuery(state, match[1] as QueryKind, match[2] ?? '').state;
  }
  return {
    ...state,
    report: { rootCause: session.report?.rootCause ?? '', service: session.report?.service ?? '', evidence: session.report?.evidence ?? '' },
    answers: { ...(session.answers ?? {}) },
  };
}
