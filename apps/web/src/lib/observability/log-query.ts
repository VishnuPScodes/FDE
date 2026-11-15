import { average, formatNumber, percentile } from './stats';
import type { ChartSeries, LogEntry, QueryResult } from './types';

/**
 * Lucene/LogQL-flavoured log search.
 *
 *   service:payments level:error "pool"          field filters + free text (AND)
 *   -route:/v1/invoices  status:>=500  latency_ms:>2000  status:5*  time:>=10:30
 *   ... | count            ... | count by status          ... | stats p95(latency_ms) by route
 *   ... | sort latency_ms desc   ... | limit 20   ... | fields time,service,msg
 */

export class LogQueryError extends Error {}

interface Filter { field: string | null; negate: boolean; op: '=' | '>' | '>=' | '<' | '<=' | 'glob'; value: string }
type Row = Record<string, string | number>;

const STAT_FUNCTIONS = ['count', 'avg', 'min', 'max', 'sum', 'p50', 'p90', 'p95', 'p99'] as const;
type StatFunction = (typeof STAT_FUNCTIONS)[number];

function splitTerms(source: string): string[] {
  const terms: string[] = [];
  let current = '';
  let quote: string | null = null;
  for (const char of source) {
    if (quote) {
      current += char;
      if (char === quote) quote = null;
    } else if (char === '"' || char === "'") {
      current += char;
      quote = char;
    } else if (/\s/.test(char)) {
      if (current) terms.push(current);
      current = '';
    } else current += char;
  }
  if (quote) throw new LogQueryError('A quote is not closed. Check your "..." phrase.');
  if (current) terms.push(current);
  return terms;
}

function unquote(value: string): string {
  return /^(["']).*\1$/.test(value) ? value.slice(1, -1) : value;
}

function splitPipes(source: string): string[] {
  const parts: string[] = [];
  let current = '';
  let quote: string | null = null;
  for (const char of source) {
    if (quote) { if (char === quote) quote = null; current += char; continue; }
    if (char === '"' || char === "'") { quote = char; current += char; continue; }
    if (char === '|') { parts.push(current); current = ''; continue; }
    current += char;
  }
  parts.push(current);
  return parts.map((part) => part.trim());
}

function parseFilters(source: string): Filter[] {
  const filters: Filter[] = [];
  for (const raw of splitTerms(source)) {
    if (raw === 'AND') continue;
    if (raw === 'OR') throw new LogQueryError('OR is not supported here. Run two searches, or use count by to compare groups.');
    let term = raw;
    let negate = false;
    if ((term.startsWith('-') || term.startsWith('!')) && term.length > 1) { negate = true; term = term.slice(1); }
    if (term.startsWith('NOT:')) { negate = true; term = term.slice(4); }
    const fieldMatch = /^([a-zA-Z_][\w.]*):(.*)$/.exec(term);
    if (!fieldMatch) {
      filters.push({ field: null, negate, op: '=', value: unquote(term) });
      continue;
    }
    const field = fieldMatch[1]!;
    let value = fieldMatch[2] ?? '';
    if (value === '') throw new LogQueryError('Filter ' + field + ': needs a value, for example ' + field + ':payments');
    let op: Filter['op'] = '=';
    const comparison = /^(>=|<=|>|<)(.+)$/.exec(value);
    if (comparison) { op = comparison[1] as Filter['op']; value = comparison[2]!; }
    else if (!/^["']/.test(value) && value.includes('*')) op = 'glob';
    filters.push({ field, negate, op, value: unquote(value) });
  }
  return filters;
}

function fieldValue(row: Row, field: string): string | number | undefined {
  if (field === 'time') return typeof row.ts === 'string' ? row.ts.slice(11, 19) : undefined;
  return row[field];
}

function compare(actual: string | number, op: Filter['op'], expected: string): boolean {
  const actualNumber = typeof actual === 'number' ? actual : Number(actual);
  const expectedNumber = Number(expected);
  const numeric = expected.trim() !== '' && !Number.isNaN(expectedNumber) && !Number.isNaN(actualNumber) && String(actual).trim() !== '';
  if (op === 'glob') {
    const pattern = new RegExp('^' + expected.split('*').map((part) => part.replace(/[.+?^${}()|[\]\\]/g, '\\$&')).join('.*') + '$', 'i');
    return pattern.test(String(actual));
  }
  if (op === '=') return numeric ? actualNumber === expectedNumber : String(actual).toLowerCase() === expected.toLowerCase();
  const left = numeric ? actualNumber : String(actual);
  const right = numeric ? expectedNumber : expected;
  if (op === '>') return left > right;
  if (op === '>=') return left >= right;
  if (op === '<') return left < right;
  return left <= right;
}

function matchesFilter(row: Row, filter: Filter): boolean {
  let result: boolean;
  if (filter.field === null) {
    const needle = filter.value.toLowerCase();
    result = Object.values(row).some((value) => typeof value === 'string' && value.toLowerCase().includes(needle));
  } else {
    const actual = fieldValue(row, filter.field);
    result = actual !== undefined && compare(actual, filter.op, filter.value);
  }
  return filter.negate ? !result : result;
}

/** Filter rows with a log-style expression (no pipes). Shared with trace search. */
export function filterRows<T extends Row>(rows: readonly T[], expression: string): T[] {
  const filters = parseFilters(expression);
  return rows.filter((row) => filters.every((filter) => matchesFilter(row, filter)));
}

function statValue(fn: StatFunction, values: number[], count: number): number {
  if (fn === 'count') return count;
  if (values.length === 0) return Number.NaN;
  if (fn === 'avg') return average(values);
  if (fn === 'min') return Math.min(...values);
  if (fn === 'max') return Math.max(...values);
  if (fn === 'sum') return values.reduce((sum, value) => sum + value, 0);
  return percentile(values, Number(fn.slice(1)));
}

function table(headers: string[], rows: (string | number)[][]): string {
  const cells = [headers, ...rows.map((row) => row.map((cell) => (typeof cell === 'number' ? formatNumber(cell) : cell)))];
  const widths = headers.map((_, column) => Math.max(...cells.map((row) => (row[column] ?? '').length)));
  return cells.map((row) => row.map((cell, column) => cell.padEnd(widths[column] ?? 0)).join('  ').trimEnd()).join('\n');
}

function perMinute(rows: readonly Row[], minutes: number): ChartSeries[] {
  const values = new Array<number>(minutes).fill(0);
  for (const row of rows) {
    const ts = typeof row.ts === 'string' ? row.ts : '';
    const minute = Number(ts.slice(14, 16));
    if (Number.isInteger(minute) && minute >= 0 && minute < minutes) values[minute] = (values[minute] ?? 0) + 1;
  }
  return [{ label: 'matching lines per minute', values }];
}

export function runLogQuery(logs: readonly LogEntry[], query: string, minutes: number): QueryResult {
  const [filterPart = '', ...stages] = splitPipes(query);
  let rows: Row[] = filterRows(logs, filterPart);
  const chart = perMinute(rows, minutes);
  const matched = rows.length;
  let projection: string[] | null = null;
  let limit = 50;

  for (const stage of stages) {
    const words = stage.split(/\s+/).filter(Boolean);
    const command = words[0]?.toLowerCase();
    if (!command) throw new LogQueryError('Empty pipe stage. Remove the extra |.');
    if (command === 'count' || command === 'stats') {
      const rest = stage.slice(command.length).trim();
      const byMatch = /\bby\s+([\w.,\s]+)$/i.exec(rest);
      const groupFields = byMatch ? byMatch[1]!.split(',').map((field) => field.trim()).filter(Boolean) : [];
      const aggregations: { fn: StatFunction; field: string | null }[] = [];
      if (command === 'count') {
        if (rest && !byMatch) throw new LogQueryError('Use "| count" or "| count by <field>".');
        aggregations.push({ fn: 'count', field: null });
      } else {
        const spec = byMatch ? rest.slice(0, byMatch.index).trim() : rest;
        if (!spec) throw new LogQueryError('stats needs a function, for example | stats p95(latency_ms) by route');
        for (const part of spec.split(/,(?![^(]*\))/).map((item) => item.trim()).filter(Boolean)) {
          const call = /^(\w+)\(\s*([\w.]*)\s*\)$/.exec(part);
          if (!call || !(STAT_FUNCTIONS as readonly string[]).includes(call[1]!.toLowerCase())) throw new LogQueryError('Unknown stats function "' + part + '". Use one of ' + STAT_FUNCTIONS.join(', ') + ', e.g. p95(latency_ms).');
          // eslint-disable-next-line @typescript-eslint/prefer-nullish-coalescing -- empty capture group means no field
          aggregations.push({ fn: call[1]!.toLowerCase() as StatFunction, field: call[2] || null });
        }
      }
      const groups = new Map<string, { keys: string[]; rows: Row[] }>();
      for (const row of rows) {
        const keys = groupFields.map((field) => { const value = fieldValue(row, field); return value === undefined ? '(none)' : String(value); });
        const key = JSON.stringify(keys);
        const group = groups.get(key) ?? { keys, rows: [] };
        group.rows.push(row);
        groups.set(key, group);
      }
      if (groups.size === 0 && groupFields.length === 0) groups.set('[]', { keys: [], rows: [] });
      const headers = [...groupFields, ...aggregations.map((item) => (item.field ? item.fn + '(' + item.field + ')' : item.fn))];
      const result = [...groups.values()].map((group) => [
        ...group.keys,
        ...aggregations.map((item) => {
          const values = item.field ? group.rows.map((row) => fieldValue(row, item.field!)).filter((value): value is number => typeof value === 'number') : [];
          return statValue(item.fn, values, item.field ? values.length : group.rows.length);
        }),
      ]);
      result.sort((a, b) => Number(b[groupFields.length] ?? 0) - Number(a[groupFields.length] ?? 0) || String(a[0]).localeCompare(String(b[0])));
      return { ok: true, text: `${matched} matching lines\n\n${table(headers, result)}`, chart };
    }
    if (command === 'sort') {
      const field = words[1];
      if (!field) throw new LogQueryError('sort needs a field, for example | sort latency_ms desc');
      const direction = words[2]?.toLowerCase() === 'asc' ? 1 : -1;
      rows = [...rows].sort((a, b) => {
        const left = fieldValue(a, field);
        const right = fieldValue(b, field);
        if (left === undefined) return 1;
        if (right === undefined) return -1;
        return (left > right ? 1 : left < right ? -1 : 0) * direction;
      });
    } else if (command === 'limit' || command === 'head') {
      const value = Number(words[1]);
      if (!Number.isInteger(value) || value < 1) throw new LogQueryError('limit needs a positive whole number.');
      limit = Math.min(value, 500);
    } else if (command === 'fields') {
      projection = stage.slice(command.length).split(',').map((field) => field.trim()).filter(Boolean);
      if (projection.length === 0) throw new LogQueryError('fields needs a comma separated list, for example | fields time,service,msg');
    } else {
      throw new LogQueryError('Unknown stage "' + command + '". Use count, stats, sort, limit or fields.');
    }
  }

  const shown = rows.slice(0, limit).map((row) => {
    if (!projection) return JSON.stringify(row);
    return JSON.stringify(Object.fromEntries(projection.map((field) => [field, fieldValue(row, field) ?? null])));
  });
  const header = `${matched} matching lines${matched > shown.length ? ` (showing ${shown.length}; add | limit N or narrow the filter)` : ''}`;
  return { ok: true, text: header + (shown.length ? '\n' + shown.join('\n') : ''), chart };
}
