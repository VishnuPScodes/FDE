import type { MetricSeries } from './types';

/**
 * A small PromQL subset evaluated as a range query over the scenario hour
 * (one step per minute). Supports:
 *   selectors      name{label="v", label!="v", label=~"re", label!~"re"}[5m]
 *   functions      rate, irate, increase, avg_over_time, max_over_time, min_over_time,
 *                  sum_over_time, histogram_quantile, abs
 *   aggregations   sum, avg, max, min, count  with by (...) / without (...)
 *   binary ops     + - * /  and comparisons > < >= <= == != (filtering, as in PromQL)
 */

export interface VectorSeries { labels: Record<string, string>; values: number[] }
export type PromValue =
  | { type: 'scalar'; value: number }
  | { type: 'vector'; series: VectorSeries[] }
  | { type: 'range'; series: MetricSeries[]; window: number };

interface Matcher { label: string; op: '=' | '!=' | '=~' | '!~'; value: string }
type Node =
  | { type: 'number'; value: number }
  | { type: 'selector'; name: string; matchers: Matcher[]; range?: number }
  | { type: 'call'; fn: string; args: Node[] }
  | { type: 'agg'; op: string; grouping: { mode: 'by' | 'without'; labels: string[] } | null; expr: Node }
  | { type: 'binary'; op: string; left: Node; right: Node }
  | { type: 'neg'; expr: Node };

interface Token { kind: 'ident' | 'number' | 'string' | 'duration' | 'op' | 'punct'; text: string }

const AGGREGATIONS = new Set(['sum', 'avg', 'max', 'min', 'count']);
const FUNCTIONS = new Set(['rate', 'irate', 'increase', 'avg_over_time', 'max_over_time', 'min_over_time', 'sum_over_time', 'histogram_quantile', 'abs']);
const COMPARISONS = new Set(['>', '<', '>=', '<=', '==', '!=']);

export class PromQLError extends Error {}

function tokenize(source: string): Token[] {
  const tokens: Token[] = [];
  let index = 0;
  while (index < source.length) {
    const char = source[index] ?? '';
    if (/\s/.test(char)) { index += 1; continue; }
    const rest = source.slice(index);
    const duration = /^\[(\d+)([smhd])\]/.exec(rest);
    if (duration) { tokens.push({ kind: 'duration', text: duration[1]! + duration[2]! }); index += duration[0].length; continue; }
    const number = /^\d+(?:\.\d+)?(?:e[+-]?\d+)?/i.exec(rest);
    if (number) { tokens.push({ kind: 'number', text: number[0] }); index += number[0].length; continue; }
    const ident = /^[a-zA-Z_:][a-zA-Z0-9_:]*/.exec(rest);
    if (ident) { tokens.push({ kind: 'ident', text: ident[0] }); index += ident[0].length; continue; }
    if (char === '"' || char === "'") {
      let end = index + 1;
      let value = '';
      while (end < source.length && source[end] !== char) {
        if (source[end] === '\\' && end + 1 < source.length) { value += source.charAt(end + 1); end += 2; continue; }
        value += source.charAt(end);
        end += 1;
      }
      if (end >= source.length) throw new PromQLError('Unclosed string starting at position ' + String(index + 1));
      tokens.push({ kind: 'string', text: value });
      index = end + 1;
      continue;
    }
    const op = /^(=~|!~|!=|>=|<=|==|[-+*/><=])/.exec(rest);
    if (op) { tokens.push({ kind: 'op', text: op[0] }); index += op[0].length; continue; }
    if ('(){},'.includes(char)) { tokens.push({ kind: 'punct', text: char }); index += 1; continue; }
    if (char === '[') throw new PromQLError('Range must look like [5m], [1h] or [30s].');
    throw new PromQLError('Unexpected character "' + char + '" at position ' + String(index + 1));
  }
  return tokens;
}

function durationMinutes(text: string): number {
  const match = /^(\d+)([smhd])$/.exec(text);
  if (!match) throw new PromQLError('Bad duration ' + text);
  const amount = Number(match[1]);
  const unit = match[2];
  const minutes = unit === 's' ? amount / 60 : unit === 'm' ? amount : unit === 'h' ? amount * 60 : amount * 1440;
  return Math.max(1, Math.ceil(minutes));
}

class Parser {
  private position = 0;
  constructor(private readonly tokens: Token[]) {}

  parse(): Node {
    if (this.tokens.length === 0) throw new PromQLError('Type a PromQL expression, for example rate(http_requests_total[5m]).');
    const node = this.comparison();
    const leftover = this.peek();
    if (leftover) throw new PromQLError('Unexpected "' + leftover.text + '"');
    return node;
  }

  private peek(): Token | undefined { return this.tokens[this.position]; }
  private next(): Token {
    const token = this.tokens[this.position];
    if (!token) throw new PromQLError('Expression ended too early.');
    this.position += 1;
    return token;
  }
  private expect(text: string): void {
    const token = this.next();
    if (token.text !== text) throw new PromQLError('Expected "' + text + '" but found "' + token.text + '"');
  }

  private comparison(): Node {
    let left = this.additive();
    for (let token = this.peek(); token?.kind === 'op' && COMPARISONS.has(token.text); token = this.peek()) {
      this.position += 1;
      left = { type: 'binary', op: token.text, left, right: this.additive() };
    }
    return left;
  }
  private additive(): Node {
    let left = this.multiplicative();
    for (let token = this.peek(); token?.kind === 'op' && (token.text === '+' || token.text === '-'); token = this.peek()) {
      this.position += 1;
      left = { type: 'binary', op: token.text, left, right: this.multiplicative() };
    }
    return left;
  }
  private multiplicative(): Node {
    let left = this.unary();
    for (let token = this.peek(); token?.kind === 'op' && (token.text === '*' || token.text === '/'); token = this.peek()) {
      this.position += 1;
      left = { type: 'binary', op: token.text, left, right: this.unary() };
    }
    return left;
  }
  private unary(): Node {
    const token = this.peek();
    if (token?.kind === 'op' && token.text === '-') { this.position += 1; return { type: 'neg', expr: this.unary() }; }
    return this.primary();
  }
  private grouping(): { mode: 'by' | 'without'; labels: string[] } | null {
    const token = this.peek();
    if (token?.kind !== 'ident' || (token.text !== 'by' && token.text !== 'without')) return null;
    this.position += 1;
    this.expect('(');
    const labels: string[] = [];
    while (this.peek()?.text !== ')') {
      const label = this.next();
      if (label.kind !== 'ident') throw new PromQLError('Expected a label name inside ' + token.text + '(...)');
      labels.push(label.text);
      if (this.peek()?.text === ',') this.position += 1;
    }
    this.expect(')');
    return { mode: token.text, labels };
  }
  private primary(): Node {
    const token = this.next();
    if (token.kind === 'number') return { type: 'number', value: Number(token.text) };
    if (token.text === '(') {
      const inner = this.comparison();
      this.expect(')');
      return inner;
    }
    if (token.kind !== 'ident') throw new PromQLError('Unexpected "' + token.text + '"');
    if (AGGREGATIONS.has(token.text)) {
      let grouping = this.grouping();
      this.expect('(');
      const expr = this.comparison();
      this.expect(')');
      grouping = grouping ?? this.grouping();
      return { type: 'agg', op: token.text, grouping, expr };
    }
    if (FUNCTIONS.has(token.text) && this.peek()?.text === '(') {
      this.position += 1;
      const args: Node[] = [];
      while (this.peek()?.text !== ')') {
        args.push(this.comparison());
        if (this.peek()?.text === ',') this.position += 1;
      }
      this.expect(')');
      return { type: 'call', fn: token.text, args };
    }
    if (this.peek()?.text === '(') throw new PromQLError('Unknown function "' + token.text + '". Supported: ' + [...FUNCTIONS, ...AGGREGATIONS].join(', '));
    const matchers: Matcher[] = [];
    if (this.peek()?.text === '{') {
      this.position += 1;
      while (this.peek()?.text !== '}') {
        const label = this.next();
        if (label.kind !== 'ident') throw new PromQLError('Expected a label name inside {...}');
        const op = this.next();
        if (op.kind !== 'op' || !['=', '!=', '=~', '!~'].includes(op.text)) throw new PromQLError('Expected =, !=, =~ or !~ after ' + label.text);
        const value = this.next();
        if (value.kind !== 'string') throw new PromQLError('Label values need quotes, for example service="payments"');
        matchers.push({ label: label.text, op: op.text as Matcher['op'], value: value.text });
        if (this.peek()?.text === ',') this.position += 1;
      }
      this.expect('}');
    }
    const selector: Node = { type: 'selector', name: token.text, matchers };
    if (this.peek()?.kind === 'duration') selector.range = durationMinutes(this.next().text);
    return selector;
  }
}

export function parsePromQL(source: string): Node {
  return new Parser(tokenize(source)).parse();
}

function matches(series: MetricSeries, name: string, matchers: Matcher[]): boolean {
  if (series.name !== name) return false;
  return matchers.every((matcher) => {
    const actual = series.labels[matcher.label] ?? '';
    if (matcher.op === '=') return actual === matcher.value;
    if (matcher.op === '!=') return actual !== matcher.value;
    let pattern: RegExp;
    try { pattern = new RegExp('^(?:' + matcher.value + ')$'); } catch { throw new PromQLError('Invalid regex ' + matcher.value); }
    return matcher.op === '=~' ? pattern.test(actual) : !pattern.test(actual);
  });
}

function withoutName(labels: Record<string, string>): Record<string, string> {
  const rest = { ...labels };
  delete rest.__name__;
  return rest;
}

function signature(labels: Record<string, string>): string {
  return JSON.stringify(Object.entries(withoutName(labels)).sort(([a], [b]) => a.localeCompare(b)));
}

function applyOp(op: string, left: number, right: number): number {
  switch (op) {
    case '+': return left + right;
    case '-': return left - right;
    case '*': return left * right;
    case '/': return right === 0 ? (left === 0 ? Number.NaN : left > 0 ? Number.POSITIVE_INFINITY : Number.NEGATIVE_INFINITY) : left / right;
    case '>': return left > right ? 1 : 0;
    case '<': return left < right ? 1 : 0;
    case '>=': return left >= right ? 1 : 0;
    case '<=': return left <= right ? 1 : 0;
    case '==': return left === right ? 1 : 0;
    case '!=': return left !== right ? 1 : 0;
    default: throw new PromQLError('Unsupported operator ' + op);
  }
}

function rangeFunction(fn: string, series: MetricSeries, window: number, steps: number): number[] {
  const out: number[] = [];
  for (let step = 0; step < steps; step += 1) {
    if (fn === 'rate' || fn === 'irate' || fn === 'increase') {
      const effective = fn === 'irate' ? 1 : window;
      const startIndex = step - effective;
      const before = startIndex >= 0 ? series.values[startIndex] ?? 0 : 0;
      const minutes = Math.min(effective, step + 1);
      const delta = Math.max(0, (series.values[step] ?? 0) - before);
      out.push(fn === 'increase' ? delta : delta / (minutes * 60));
    } else {
      const slice = series.values.slice(Math.max(0, step - window + 1), step + 1);
      if (fn === 'avg_over_time') out.push(slice.reduce((sum, value) => sum + value, 0) / slice.length);
      else if (fn === 'max_over_time') out.push(Math.max(...slice));
      else if (fn === 'min_over_time') out.push(Math.min(...slice));
      else out.push(slice.reduce((sum, value) => sum + value, 0));
    }
  }
  return out;
}

function histogramQuantile(phi: number, vector: VectorSeries[], steps: number): VectorSeries[] {
  const groups = new Map<string, { labels: Record<string, string>; buckets: { le: number; values: number[] }[] }>();
  for (const series of vector) {
    const leText = series.labels.le;
    if (leText === undefined) continue;
    const rest = withoutName(series.labels);
    delete rest.le;
    const key = signature(rest);
    const group = groups.get(key) ?? { labels: rest, buckets: [] };
    group.buckets.push({ le: leText === '+Inf' ? Number.POSITIVE_INFINITY : Number(leText), values: series.values });
    groups.set(key, group);
  }
  if (groups.size === 0) throw new PromQLError('histogram_quantile needs *_bucket series with an "le" label. Keep le in your sum by (...).');
  const out: VectorSeries[] = [];
  for (const group of groups.values()) {
    group.buckets.sort((a, b) => a.le - b.le);
    const values: number[] = [];
    for (let step = 0; step < steps; step += 1) {
      const total = group.buckets[group.buckets.length - 1]?.values[step] ?? Number.NaN;
      if (!Number.isFinite(total) || total <= 0) { values.push(Number.NaN); continue; }
      const rank = phi * total;
      let previousLe = 0;
      let previousCount = 0;
      let result = Number.NaN;
      for (const bucket of group.buckets) {
        const count = bucket.values[step] ?? 0;
        if (count >= rank) {
          if (bucket.le === Number.POSITIVE_INFINITY) { result = previousLe; break; }
          const inBucket = count - previousCount;
          result = inBucket <= 0 ? bucket.le : previousLe + (bucket.le - previousLe) * ((rank - previousCount) / inBucket);
          break;
        }
        previousLe = bucket.le;
        previousCount = count;
      }
      values.push(result);
    }
    out.push({ labels: group.labels, values });
  }
  return out;
}

function toVector(value: PromValue, context: string): VectorSeries[] {
  if (value.type === 'vector') return value.series;
  if (value.type === 'range') throw new PromQLError(context + ' needs an instant vector. Wrap the range selector in rate(...) or another *_over_time function.');
  throw new PromQLError(context + ' needs a vector, not a number.');
}

export function evaluatePromQL(source: string, metrics: MetricSeries[], steps: number): PromValue {
  return evaluate(parsePromQL(source), metrics, steps);
}

function evaluate(node: Node, metrics: MetricSeries[], steps: number): PromValue {
  switch (node.type) {
    case 'number': return { type: 'scalar', value: node.value };
    case 'neg': {
      const inner = evaluate(node.expr, metrics, steps);
      if (inner.type === 'scalar') return { type: 'scalar', value: -inner.value };
      return { type: 'vector', series: toVector(inner, 'Negation').map((series) => ({ labels: withoutName(series.labels), values: series.values.map((value) => -value) })) };
    }
    case 'selector': {
      const selected = metrics.filter((series) => matches(series, node.name, node.matchers));
      if (selected.length === 0 && !metrics.some((series) => series.name === node.name)) {
        const known = [...new Set(metrics.map((series) => series.name))].join(', ');
        throw new PromQLError('No metric named ' + node.name + '. Known metrics: ' + known);
      }
      if (node.range !== undefined) return { type: 'range', series: selected, window: node.range };
      return { type: 'vector', series: selected.map((series) => ({ labels: { __name__: series.name, ...series.labels }, values: series.values.slice(0, steps) })) };
    }
    case 'call': {
      if (node.fn === 'histogram_quantile') {
        const phiNode = node.args[0];
        const vectorNode = node.args[1];
        if (!phiNode || !vectorNode || node.args.length !== 2) throw new PromQLError('histogram_quantile takes two arguments: histogram_quantile(0.95, <buckets>)');
        const phi = evaluate(phiNode, metrics, steps);
        if (phi.type !== 'scalar' || phi.value < 0 || phi.value > 1) throw new PromQLError('The first argument of histogram_quantile must be a number between 0 and 1, like 0.95');
        return { type: 'vector', series: histogramQuantile(phi.value, toVector(evaluate(vectorNode, metrics, steps), 'histogram_quantile'), steps) };
      }
      const argument = node.args[0];
      if (!argument || node.args.length !== 1) throw new PromQLError(node.fn + ' takes exactly one argument.');
      const value = evaluate(argument, metrics, steps);
      if (node.fn === 'abs') return { type: 'vector', series: toVector(value, 'abs').map((series) => ({ labels: withoutName(series.labels), values: series.values.map(Math.abs) })) };
      if (value.type !== 'range') throw new PromQLError(node.fn + ' needs a range selector such as http_requests_total[5m].');
      return { type: 'vector', series: value.series.map((series) => ({ labels: { ...series.labels }, values: rangeFunction(node.fn, series, value.window, steps) })) };
    }
    case 'agg': {
      const vector = toVector(evaluate(node.expr, metrics, steps), node.op);
      const groups = new Map<string, { labels: Record<string, string>; members: VectorSeries[] }>();
      for (const series of vector) {
        const base = withoutName(series.labels);
        let labels: Record<string, string> = {};
        if (node.grouping?.mode === 'by') for (const label of node.grouping.labels) { if (base[label] !== undefined) labels[label] = base[label]; }
        else if (node.grouping?.mode === 'without') labels = Object.fromEntries(Object.entries(base).filter(([key]) => !node.grouping!.labels.includes(key)));
        const key = signature(labels);
        const group = groups.get(key) ?? { labels, members: [] };
        group.members.push(series);
        groups.set(key, group);
      }
      const out: VectorSeries[] = [];
      for (const group of groups.values()) {
        const values: number[] = [];
        for (let step = 0; step < steps; step += 1) {
          const present = group.members.map((series) => series.values[step] ?? Number.NaN).filter((value) => !Number.isNaN(value));
          if (present.length === 0) { values.push(Number.NaN); continue; }
          if (node.op === 'sum') values.push(present.reduce((sum, value) => sum + value, 0));
          else if (node.op === 'avg') values.push(present.reduce((sum, value) => sum + value, 0) / present.length);
          else if (node.op === 'max') values.push(Math.max(...present));
          else if (node.op === 'min') values.push(Math.min(...present));
          else values.push(present.length);
        }
        out.push({ labels: group.labels, values });
      }
      return { type: 'vector', series: out };
    }
    case 'binary': {
      const left = evaluate(node.left, metrics, steps);
      const right = evaluate(node.right, metrics, steps);
      const comparison = COMPARISONS.has(node.op);
      if (left.type === 'scalar' && right.type === 'scalar') return { type: 'scalar', value: applyOp(node.op, left.value, right.value) };
      if (left.type === 'scalar' || right.type === 'scalar') {
        const scalar = left.type === 'scalar' ? left.value : (right as { value: number }).value;
        const vector = toVector(left.type === 'scalar' ? right : left, 'Operator ' + node.op);
        return {
          type: 'vector',
          series: vector.map((series) => ({
            labels: withoutName(series.labels),
            values: series.values.map((value) => {
              const result = left.type === 'scalar' ? applyOp(node.op, scalar, value) : applyOp(node.op, value, scalar);
              return comparison ? (result === 1 ? value : Number.NaN) : result;
            }),
          })),
        };
      }
      const leftVector = toVector(left, 'Operator ' + node.op);
      const rightIndex = new Map(toVector(right, 'Operator ' + node.op).map((series) => [signature(series.labels), series]));
      const out: VectorSeries[] = [];
      for (const series of leftVector) {
        const partner = rightIndex.get(signature(series.labels));
        if (!partner) continue;
        out.push({
          labels: withoutName(series.labels),
          values: series.values.map((value, step) => {
            const other = partner.values[step] ?? Number.NaN;
            if (Number.isNaN(value) || Number.isNaN(other)) return Number.NaN;
            const result = applyOp(node.op, value, other);
            return comparison ? (result === 1 ? value : Number.NaN) : result;
          }),
        });
      }
      if (out.length === 0 && leftVector.length > 0) throw new PromQLError('No matching label sets on both sides of "' + node.op + '". Aggregate both sides with the same by (...) labels.');
      return { type: 'vector', series: out };
    }
  }
}

export function formatLabels(labels: Record<string, string>): string {
  const { __name__: name, ...rest } = labels;
  const inner = Object.entries(rest).map(([key, value]) => key + '="' + value + '"').join(', ');
  return (name ?? '') + '{' + inner + '}';
}
