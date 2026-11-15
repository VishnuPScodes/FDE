import type { KubeState, LabelSelector, Labels } from './types';

/** Simulated wall clock: cluster time 0 is 15 Jan 2026, 10:00 IST. */
export const BASE_TIME_MS = Date.UTC(2026, 0, 15, 4, 30, 0);

export function isoTime(clock: number): string {
  return new Date(BASE_TIME_MS + clock * 1000).toISOString().replace('.000Z', 'Z');
}

/** kubectl-style human durations: 45s, 2m10s, 5m, 3h20m, 2d. */
export function humanDuration(seconds: number): string {
  const s = Math.max(0, Math.floor(seconds));
  if (s < 120) return `${s}s`;
  const minutes = Math.floor(s / 60);
  if (minutes < 10) return `${minutes}m${s % 60 ? `${s % 60}s` : ''}`;
  if (minutes < 180) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 8) return `${hours}h${minutes % 60 ? `${minutes % 60}m` : ''}`;
  if (hours < 48) return `${hours}h`;
  return `${Math.floor(hours / 24)}d`;
}

export function age(state: KubeState, createdAt: number): string {
  return humanDuration(state.clock - createdAt);
}

/** Parse a CPU quantity into millicores. Returns NaN for invalid input. */
export function parseCpu(value: string | number | undefined): number {
  if (value === undefined || value === '') return 0;
  const text = String(value).trim();
  if (/^\d+m$/.test(text)) return Number(text.slice(0, -1));
  if (/^\d*\.?\d+$/.test(text)) return Math.round(Number(text) * 1000);
  return Number.NaN;
}

const MEMORY_UNITS: Record<string, number> = {
  '': 1 / (1024 * 1024), k: 1000 / (1024 * 1024), M: 1e6 / (1024 * 1024), G: 1e9 / (1024 * 1024),
  Ki: 1 / 1024, Mi: 1, Gi: 1024, Ti: 1024 * 1024,
};

/** Parse a memory quantity into MiB. Returns NaN for invalid input. */
export function parseMemory(value: string | number | undefined): number {
  if (value === undefined || value === '') return 0;
  const match = /^(\d*\.?\d+)(Ki|Mi|Gi|Ti|k|M|G)?$/.exec(String(value).trim());
  if (!match) return Number.NaN;
  return Number(match[1]) * (MEMORY_UNITS[match[2] ?? ''] ?? 1);
}

export function formatMemory(mi: number): string {
  if (mi >= 1024 && mi % 1024 === 0) return `${mi / 1024}Gi`;
  return `${Math.round(mi)}Mi`;
}

const ALPHABET = 'bcdfghjklmnpqrstvwxz2456789';

/** Deterministic FNV-1a based suffix using Kubernetes' safe alphabet. */
export function safeHash(input: string, length: number): string {
  let hash = 0x811c9dc5;
  let output = '';
  let round = 0;
  while (output.length < length) {
    for (let i = 0; i < input.length; i++) {
      hash ^= input.charCodeAt(i) + round;
      hash = Math.imul(hash, 0x01000193) >>> 0;
    }
    let value = hash;
    for (let i = 0; i < 6 && output.length < length; i++) {
      output += ALPHABET.charAt(value % ALPHABET.length);
      value = Math.floor(value / ALPHABET.length);
    }
    round++;
  }
  return output;
}

export function nextSuffix(state: KubeState, length = 5): string {
  state.seq += 1;
  return safeHash(`pod-${state.seq}`, length);
}

export function nextUid(state: KubeState): string {
  state.seq += 1;
  const h = safeHash(`uid-${state.seq}`, 32).replace(/[^0-9a-f]/g, (c) => ((c.charCodeAt(0) % 6) + 10).toString(16));
  return h.slice(0, 8) + '-' + h.slice(8, 12) + '-' + h.slice(12, 16) + '-' + h.slice(16, 20) + '-' + h.slice(20, 32);
}

/** Render rows the way kubectl's tabwriter does (3 spaces of padding). */
export function table(rows: string[][]): string {
  if (!rows.length) return '';
  const widths: number[] = [];
  for (const row of rows) row.forEach((cell, i) => { widths[i] = Math.max(widths[i] ?? 0, cell.length); });
  return rows.map((row) => row.map((cell, i) => (i === row.length - 1 ? cell : cell.padEnd((widths[i] ?? 0) + 3))).join('').trimEnd()).join('\n') + '\n';
}

export function formatLabels(labels: Labels): string {
  const entries = Object.entries(labels);
  return entries.length ? entries.map(([k, v]) => k + '=' + v).join(',') : '<none>';
}

export function matchesLabels(labels: Labels, selector: Labels): boolean {
  const entries = Object.entries(selector);
  return entries.length > 0 && entries.every(([k, v]) => labels[k] === v);
}

export function matchesSelector(labels: Labels, selector: LabelSelector): boolean {
  const hasRules = Object.keys(selector.matchLabels).length > 0 || selector.matchExpressions.length > 0;
  if (!hasRules) return false;
  if (!Object.entries(selector.matchLabels).every(([k, v]) => labels[k] === v)) return false;
  return selector.matchExpressions.every((expr) => {
    const value = labels[expr.key];
    if (expr.operator === 'Exists') return value !== undefined;
    if (expr.operator === 'DoesNotExist') return value === undefined;
    if (expr.operator === 'In') return value !== undefined && expr.values.includes(value);
    return value === undefined || !expr.values.includes(value);
  });
}

export type SelectorTerm =
  | { op: '=' | '!='; key: string; value: string }
  | { op: 'in' | 'notin'; key: string; values: string[] }
  | { op: 'exists' | '!exists'; key: string };

/** Parse a kubectl -l selector string such as `app=web,tier!=db,env in (prod,staging)`. */
export function parseSelector(text: string): SelectorTerm[] | string {
  const terms: SelectorTerm[] = [];
  const parts: string[] = [];
  let depth = 0;
  let current = '';
  for (const ch of text) {
    if (ch === '(') depth++;
    if (ch === ')') depth--;
    if (ch === ',' && depth === 0) { parts.push(current); current = ''; } else current += ch;
  }
  parts.push(current);
  for (const raw of parts) {
    const part = raw.trim();
    if (!part) continue;
    let match = /^([\w./-]+)\s+(in|notin)\s+\(([^)]*)\)$/.exec(part);
    if (match) { terms.push({ op: match[2] as 'in' | 'notin', key: match[1]!, values: match[3]!.split(',').map((x) => x.trim()).filter(Boolean) }); continue; }
    match = /^([\w./-]+)\s*(==|=|!=)\s*([\w.-]*)$/.exec(part);
    if (match) { terms.push({ op: match[2] === '!=' ? '!=' : '=', key: match[1]!, value: match[3]! }); continue; }
    match = /^(!?)([\w./-]+)$/.exec(part);
    if (match) { terms.push({ op: match[1] ? '!exists' : 'exists', key: match[2]! }); continue; }
    return 'error: unable to parse requirement: found \'' + part + '\', expected: \'=\', \'!=\', \'==\', \'in\', notin\'';
  }
  return terms;
}

export function matchesTerms(labels: Labels, terms: SelectorTerm[]): boolean {
  return terms.every((term) => {
    const value = labels[term.key];
    if (term.op === '=') return value === term.value;
    if (term.op === '!=') return value !== term.value;
    if (term.op === 'in') return value !== undefined && term.values.includes(value);
    if (term.op === 'notin') return value === undefined || !term.values.includes(value);
    if (term.op === 'exists') return value !== undefined;
    return value === undefined;
  });
}

export function selectorToString(selector: LabelSelector): string {
  const parts = Object.entries(selector.matchLabels).map(([k, v]) => k + '=' + v);
  for (const expr of selector.matchExpressions) {
    if (expr.operator === 'Exists') parts.push(expr.key);
    else if (expr.operator === 'DoesNotExist') parts.push('!' + expr.key);
    else parts.push(expr.key + ' ' + expr.operator.toLowerCase() + ' (' + expr.values.join(',') + ')');
  }
  return parts.join(',');
}

const B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';

export function encodeBase64(text: string): string {
  const bytes = new TextEncoder().encode(text);
  let out = '';
  for (let i = 0; i < bytes.length; i += 3) {
    const a = bytes[i]!;
    const b = bytes[i + 1];
    const c = bytes[i + 2];
    out += B64[a >> 2]! + B64[((a & 3) << 4) | ((b ?? 0) >> 4)]!;
    out += b === undefined ? '=' : B64[((b & 15) << 2) | ((c ?? 0) >> 6)]!;
    out += c === undefined ? '=' : B64[c & 63]!;
  }
  return out;
}

/** Decode base64; returns an error message (kubectl style) instead of throwing. */
export function decodeBase64(text: string): { ok: true; value: string } | { ok: false; error: string } {
  const clean = text.replace(/\s+/g, '');
  const bytes: number[] = [];
  let buffer = 0;
  let bits = 0;
  for (let i = 0; i < clean.length; i++) {
    const ch = clean[i]!;
    if (ch === '=') {
      if (clean.slice(i).replace(/=/g, '') !== '' || clean.length % 4 !== 0) return { ok: false, error: `illegal base64 data at input byte ${i}` };
      break;
    }
    const index = B64.indexOf(ch);
    if (index < 0) return { ok: false, error: `illegal base64 data at input byte ${i}` };
    buffer = (buffer << 6) | index;
    bits += 6;
    if (bits >= 8) { bits -= 8; bytes.push((buffer >> bits) & 0xff); }
  }
  if (!clean.includes('=') && clean.length % 4 !== 0) return { ok: false, error: `illegal base64 data at input byte ${clean.length}` };
  return { ok: true, value: new TextDecoder().decode(new Uint8Array(bytes)) };
}

/** Split a command line into words, honouring single and double quotes. */
export function tokenize(line: string): string[] {
  const out: string[] = [];
  let current = '';
  let quote: '"' | "'" | null = null;
  let has = false;
  for (const ch of line) {
    if (quote) {
      if (ch === quote) quote = null; else current += ch;
      continue;
    }
    if (ch === '"' || ch === "'") { quote = ch; has = true; continue; }
    if (/\s/.test(ch)) { if (has || current) { out.push(current); current = ''; has = false; } continue; }
    current += ch;
  }
  if (has || current) out.push(current);
  return out;
}

/** Split on top-level pipes, ignoring pipes inside quotes. */
export function splitPipes(line: string): string[] {
  const parts: string[] = [];
  let current = '';
  let quote: string | null = null;
  for (const ch of line) {
    if (quote) { if (ch === quote) quote = null; current += ch; continue; }
    if (ch === '"' || ch === "'") { quote = ch; current += ch; continue; }
    if (ch === '|') { parts.push(current.trim()); current = ''; continue; }
    current += ch;
  }
  parts.push(current.trim());
  return parts;
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function stableStringify(value: unknown): string {
  if (Array.isArray(value)) return '[' + value.map(stableStringify).join(',') + ']';
  if (isRecord(value)) return '{' + Object.keys(value).sort().filter((k) => value[k] !== undefined).map((k) => JSON.stringify(k) + ':' + stableStringify(value[k])).join(',') + '}';
  const json = JSON.stringify(value) as string | undefined; // undefined at runtime for undefined/functions
  return json ?? 'null';
}

export function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

export const DNS_LABEL = /^[a-z0-9]([-a-z0-9]*[a-z0-9])?$/;
export const DNS_SUBDOMAIN = /^[a-z0-9]([-a-z0-9]*[a-z0-9])?(\.[a-z0-9]([-a-z0-9]*[a-z0-9])?)*$/;
