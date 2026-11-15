import { filterRows, LogQueryError } from './log-query';
import type { QueryResult, Span, Telemetry, TraceSummary } from './types';

/**
 * Trace queries:
 *   trace <trace_id>                 waterfall for one trace (an 8+ character prefix is enough)
 *   slowest [N] [filters]            slowest traces, e.g. slowest 5 route:/v1/invoices
 *   errors [N] [filters]             failed traces, newest first
 *   <filters>                        e.g. service:payments duration_ms:>1000 status:503
 */

const spanIndex = new WeakMap<Telemetry, Map<string, Span[]>>();

export function spansForTrace(telemetry: Telemetry, traceId: string): Span[] {
  let index = spanIndex.get(telemetry);
  if (!index) {
    index = new Map();
    for (const span of telemetry.spans) {
      const list = index.get(span.trace_id) ?? [];
      list.push(span);
      index.set(span.trace_id, list);
    }
    spanIndex.set(telemetry, index);
  }
  return index.get(traceId) ?? [];
}

function summaryLine(trace: TraceSummary): string {
  return [trace.time, trace.trace_id, trace.root_name.padEnd(26), (String(trace.duration_ms) + 'ms').padStart(8), 'status=' + String(trace.status), 'spans=' + String(trace.span_count)].join('  ');
}

/** Order spans parent-first and compute their depth for the waterfall. */
export function orderSpans(spans: readonly Span[]): { span: Span; depth: number }[] {
  const children = new Map<string | null, Span[]>();
  for (const span of spans) {
    const list = children.get(span.parent_span_id) ?? [];
    list.push(span);
    children.set(span.parent_span_id, list);
  }
  const out: { span: Span; depth: number }[] = [];
  const visit = (parent: string | null, depth: number) => {
    for (const span of (children.get(parent) ?? []).sort((a, b) => a.start_ms - b.start_ms)) {
      out.push({ span, depth });
      visit(span.span_id, depth + 1);
    }
  };
  visit(null, 0);
  return out;
}

function waterfallText(trace: TraceSummary, spans: readonly Span[]): string {
  const ordered = orderSpans(spans);
  const width = 32;
  const lines = ordered.map(({ span, depth }) => {
    const offset = span.start_ms - trace.start_ms;
    const start = Math.floor((offset / Math.max(trace.duration_ms, 1)) * width);
    const length = Math.max(1, Math.round((span.duration_ms / Math.max(trace.duration_ms, 1)) * width));
    const bar = ' '.repeat(Math.min(start, width - 1)) + '█'.repeat(Math.min(length, width - Math.min(start, width - 1)));
    const label = ('  '.repeat(depth) + span.service + ' · ' + span.name).padEnd(52);
    const attributes = Object.entries(span.attributes).map(([key, value]) => key + '=' + String(value)).join(' ');
    return label + ' |' + bar.padEnd(width) + '| +' + String(offset) + 'ms ' + String(span.duration_ms) + 'ms ' + span.status + (attributes ? '\n' + ' '.repeat(depth * 2 + 4) + attributes : '');
  });
  return 'trace ' + trace.trace_id + '  request_id=' + trace.request_id + '  ' + trace.root_name + '  ' + String(trace.duration_ms) + 'ms  status=' + String(trace.status) + '  started ' + trace.time + '\n' + lines.join('\n');
}

export function runTraceQuery(telemetry: Telemetry, query: string): QueryResult {
  const trimmed = query.trim();
  const words = trimmed.split(/\s+/);
  const command = words[0]?.toLowerCase() ?? '';
  if (!trimmed) throw new LogQueryError('Type a trace query, for example: slowest 5');

  if (command === 'trace') {
    const id = (words[1] ?? '').toLowerCase();
    if (id.length < 8) throw new LogQueryError('Give a trace id (at least 8 characters), for example: trace 4f2a91c0');
    const matches = telemetry.traces.filter((trace) => trace.trace_id.startsWith(id));
    if (matches.length === 0) throw new LogQueryError('No trace starts with ' + id + '. Copy the trace_id from a log line or a slowest/errors list.');
    if (matches.length > 1) throw new LogQueryError(String(matches.length) + ' traces start with ' + id + '. Use more characters.');
    const trace = matches[0]!;
    const spans = spansForTrace(telemetry, trace.trace_id);
    return { ok: true, text: waterfallText(trace, spans), waterfall: orderSpans(spans).map((item) => item.span) };
  }

  let count = 20;
  let rest = trimmed;
  let mode: 'slowest' | 'errors' | 'search' = 'search';
  if (command === 'slowest' || command === 'errors') {
    mode = command;
    rest = words.slice(1).join(' ');
    const maybeCount = Number(words[1]);
    if (Number.isInteger(maybeCount) && maybeCount > 0) { count = Math.min(maybeCount, 100); rest = words.slice(2).join(' '); }
    else count = 10;
  }
  let traces = filterRows(telemetry.traces as unknown as Record<string, string | number>[], rest) as unknown as TraceSummary[];
  if (mode === 'errors') traces = traces.filter((trace) => trace.error).sort((a, b) => b.start_ms - a.start_ms);
  else traces = [...traces].sort((a, b) => b.duration_ms - a.duration_ms);
  const shown = traces.slice(0, count);
  const values = new Array<number>(telemetry.minutes).fill(0);
  for (const trace of traces) {
    const minute = Math.floor(trace.start_ms / 60000);
    values[minute] = Math.max(values[minute] ?? 0, trace.duration_ms);
  }
  const header = String(traces.length) + ' matching traces' + (mode === 'errors' ? ' with errors (newest first)' : ' (slowest first)') + '. Open one with: trace <trace_id>';
  return { ok: true, text: header + (shown.length ? '\n' + shown.map(summaryLine).join('\n') : ''), chart: [{ label: 'slowest matching trace per minute (ms)', values }] };
}

