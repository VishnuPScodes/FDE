/**
 * A small evaluator for GitHub Actions `${{ }}` expressions.
 *
 * Supports literals, context property access (case-insensitive), `!`, `==`, `!=`,
 * `<`, `<=`, `>`, `>=`, `&&`, `||`, parentheses, and the common built-in functions.
 */

export type ExprValue = string | number | boolean | null | ExprValue[] | { [key: string]: ExprValue };
export type ExprObject = Record<string, ExprValue>;

export interface ExprStatus { success: boolean; failure: boolean; cancelled: boolean }

export interface ExprContext {
  contexts: Record<string, ExprValue>;
  status?: ExprStatus;
  hashFiles?: (patterns: string[]) => string;
}

export class ExpressionError extends Error {}

export const NAMED_VALUES = ['github', 'env', 'vars', 'secrets', 'inputs', 'matrix', 'needs', 'steps', 'job', 'jobs', 'runner', 'strategy'];
const FUNCTIONS = ['success', 'failure', 'always', 'cancelled', 'contains', 'startswith', 'endswith', 'format', 'join', 'tojson', 'fromjson', 'hashfiles'];
const STATUS_FUNCTIONS = ['success', 'failure', 'always', 'cancelled'];

type Token =
  | { type: 'string'; value: string; pos: number }
  | { type: 'number'; value: number; pos: number }
  | { type: 'ident'; value: string; pos: number }
  | { type: 'op'; value: string; pos: number };

type Node =
  | { kind: 'literal'; value: ExprValue }
  | { kind: 'name'; name: string; pos: number }
  | { kind: 'member'; object: Node; property: Node }
  | { kind: 'call'; name: string; args: Node[]; pos: number }
  | { kind: 'unary'; operand: Node }
  | { kind: 'binary'; op: string; left: Node; right: Node };

function tokenize(source: string): Token[] {
  const tokens: Token[] = [];
  let i = 0;
  while (i < source.length) {
    const char = source[i]!;
    if (/\s/.test(char)) { i++; continue; }
    if (char === "'") {
      let value = '';
      let j = i + 1;
      for (;;) {
        if (j >= source.length) throw new ExpressionError(`Unexpected end of expression: '${source.trim()}'. Located at position ${i + 1} within expression: ${source.trim()}`);
        if (source[j] === "'") {
          if (source[j + 1] === "'") { value += "'"; j += 2; continue; }
          break;
        }
        value += source.charAt(j);
        j++;
      }
      tokens.push({ type: 'string', value, pos: i + 1 });
      i = j + 1;
      continue;
    }
    if (/[0-9]/.test(char) || (char === '-' && /[0-9]/.test(source[i + 1] ?? '') && !isValueEnd(tokens.at(-1)))) {
      const match = /^-?(0x[0-9a-f]+|\d+(\.\d+)?(e[+-]?\d+)?)/i.exec(source.slice(i));
      if (match) {
        tokens.push({ type: 'number', value: Number(match[0]), pos: i + 1 });
        i += match[0].length;
        continue;
      }
    }
    if (/[A-Za-z_]/.test(char)) {
      const match = /^[A-Za-z_][A-Za-z0-9_-]*/.exec(source.slice(i))!;
      tokens.push({ type: 'ident', value: match[0], pos: i + 1 });
      i += match[0].length;
      continue;
    }
    const two = source.slice(i, i + 2);
    if (['==', '!=', '<=', '>=', '&&', '||'].includes(two)) { tokens.push({ type: 'op', value: two, pos: i + 1 }); i += 2; continue; }
    if ('!<>()[].,*'.includes(char)) { tokens.push({ type: 'op', value: char, pos: i + 1 }); i++; continue; }
    throw new ExpressionError(`Unexpected symbol: '${char}'. Located at position ${i + 1} within expression: ${source.trim()}`);
  }
  return tokens;
}

function isValueEnd(token: Token | undefined): boolean {
  if (!token) return false;
  return token.type !== 'op' || token.value === ')' || token.value === ']';
}

class Parser {
  private index = 0;
  constructor(private readonly tokens: Token[], private readonly source: string) {}

  parse(): Node {
    if (this.tokens.length === 0) throw new ExpressionError('An expression was expected');
    const node = this.or();
    const extra = this.tokens[this.index];
    if (extra) throw this.error(extra);
    return node;
  }

  private error(token: Token): ExpressionError {
    return new ExpressionError(`Unexpected symbol: '${String(token.value)}'. Located at position ${token.pos} within expression: ${this.source.trim()}`);
  }
  private peek(value: string): boolean { const t = this.tokens[this.index]; return t?.type === 'op' && t.value === value; }
  private take(value: string): boolean { if (this.peek(value)) { this.index++; return true; } return false; }

  private or(): Node {
    let left = this.and();
    while (this.take('||')) left = { kind: 'binary', op: '||', left, right: this.and() };
    return left;
  }
  private and(): Node {
    let left = this.equality();
    while (this.take('&&')) left = { kind: 'binary', op: '&&', left, right: this.equality() };
    return left;
  }
  private equality(): Node {
    let left = this.comparison();
    for (;;) {
      if (this.take('==')) left = { kind: 'binary', op: '==', left, right: this.comparison() };
      else if (this.take('!=')) left = { kind: 'binary', op: '!=', left, right: this.comparison() };
      else return left;
    }
  }
  private comparison(): Node {
    let left = this.unary();
    for (;;) {
      const op = ['<=', '>=', '<', '>'].find((value) => this.peek(value));
      if (!op) return left;
      this.index++;
      left = { kind: 'binary', op, left, right: this.unary() };
    }
  }
  private unary(): Node {
    if (this.take('!')) return { kind: 'unary', operand: this.unary() };
    return this.postfix();
  }
  private postfix(): Node {
    let node = this.primary();
    for (;;) {
      if (this.take('.')) {
        const token = this.tokens[this.index];
        if (token?.type === 'ident') { this.index++; node = { kind: 'member', object: node, property: { kind: 'literal', value: token.value } }; continue; }
        if (token?.type === 'op' && token.value === '*') { this.index++; continue; }
        throw new ExpressionError(`Unexpected end of expression. Located at position ${this.source.length} within expression: ${this.source.trim()}`);
      }
      if (this.take('[')) {
        const property = this.or();
        if (!this.take(']')) throw new ExpressionError(`Expected ']' within expression: ${this.source.trim()}`);
        node = { kind: 'member', object: node, property };
        continue;
      }
      return node;
    }
  }
  private primary(): Node {
    const token = this.tokens[this.index];
    if (!token) throw new ExpressionError(`Unexpected end of expression. Located at position ${this.source.length} within expression: ${this.source.trim()}`);
    this.index++;
    if (token.type === 'string' || token.type === 'number') return { kind: 'literal', value: token.value };
    if (token.type === 'ident') {
      const lower = token.value.toLowerCase();
      if (lower === 'true') return { kind: 'literal', value: true };
      if (lower === 'false') return { kind: 'literal', value: false };
      if (lower === 'null') return { kind: 'literal', value: null };
      if (this.take('(')) {
        const args: Node[] = [];
        if (!this.take(')')) {
          do args.push(this.or()); while (this.take(','));
          if (!this.take(')')) throw new ExpressionError(`Expected ')' within expression: ${this.source.trim()}`);
        }
        return { kind: 'call', name: token.value, args, pos: token.pos };
      }
      return { kind: 'name', name: token.value, pos: token.pos };
    }
    if (token.value === '(') {
      const node = this.or();
      if (!this.take(')')) throw new ExpressionError(`Expected ')' within expression: ${this.source.trim()}`);
      return node;
    }
    throw this.error(token);
  }
}

function parse(source: string): Node {
  return new Parser(tokenize(source), source).parse();
}

/** Throws ExpressionError when the expression has unknown contexts, functions, or syntax errors. */
export function validateExpression(source: string, allowed: readonly string[] = NAMED_VALUES): void {
  const walk = (node: Node): void => {
    if (node.kind === 'name') {
      if (!allowed.includes(node.name.toLowerCase())) {
        throw new ExpressionError(`Unrecognized named-value: '${node.name}'. Located at position ${node.pos} within expression: ${source.trim()}`);
      }
    } else if (node.kind === 'member') { walk(node.object); walk(node.property); }
    else if (node.kind === 'call') {
      if (!FUNCTIONS.includes(node.name.toLowerCase())) {
        throw new ExpressionError(`Unrecognized function: '${node.name}'. Located at position ${node.pos} within expression: ${source.trim()}`);
      }
      node.args.forEach(walk);
    } else if (node.kind === 'unary') walk(node.operand);
    else if (node.kind === 'binary') { walk(node.left); walk(node.right); }
  };
  walk(parse(source));
}

/** True when the expression calls success(), failure(), always(), or cancelled(). */
export function usesStatusFunction(source: string): boolean {
  try {
    let found = false;
    const walk = (node: Node): void => {
      if (node.kind === 'call') { if (STATUS_FUNCTIONS.includes(node.name.toLowerCase())) found = true; node.args.forEach(walk); }
      else if (node.kind === 'member') { walk(node.object); walk(node.property); }
      else if (node.kind === 'unary') walk(node.operand);
      else if (node.kind === 'binary') { walk(node.left); walk(node.right); }
    };
    walk(parse(source));
    return found;
  } catch {
    return false;
  }
}

export function evaluateExpression(source: string, context: ExprContext): ExprValue {
  return evaluate(parse(stripBraces(source)), context);
}

function stripBraces(source: string): string {
  const match = /^\s*\$\{\{([\s\S]*)\}\}\s*$/.exec(source);
  return match ? match[1]! : source;
}

function evaluate(node: Node, context: ExprContext): ExprValue {
  switch (node.kind) {
    case 'literal': return node.value;
    case 'name': return lookup(context.contexts, node.name);
    case 'member': {
      const object = evaluate(node.object, context);
      const property = evaluate(node.property, context);
      if (Array.isArray(object)) {
        const index = typeof property === 'number' ? property : Number(property);
        return Number.isInteger(index) ? object[index] ?? null : null;
      }
      if (isObject(object)) return lookup(object, toText(property));
      return null;
    }
    case 'unary': return !truthy(evaluate(node.operand, context));
    case 'binary': {
      if (node.op === '&&') { const left = evaluate(node.left, context); return truthy(left) ? evaluate(node.right, context) : left; }
      if (node.op === '||') { const left = evaluate(node.left, context); return truthy(left) ? left : evaluate(node.right, context); }
      const left = evaluate(node.left, context);
      const right = evaluate(node.right, context);
      if (node.op === '==') return looseEquals(left, right);
      if (node.op === '!=') return !looseEquals(left, right);
      const a = toNumber(left);
      const b = toNumber(right);
      if (node.op === '<') return a < b;
      if (node.op === '<=') return a <= b;
      if (node.op === '>') return a > b;
      return a >= b;
    }
    case 'call': return callFunction(node.name.toLowerCase(), node.args.map((arg) => evaluate(arg, context)), context);
  }
}

function callFunction(name: string, args: ExprValue[], context: ExprContext): ExprValue {
  const status = context.status ?? { success: true, failure: false, cancelled: false };
  switch (name) {
    case 'success': return status.success;
    case 'failure': return status.failure;
    case 'always': return true;
    case 'cancelled': return status.cancelled;
    case 'contains': {
      const [haystack, needle] = args;
      if (Array.isArray(haystack)) return haystack.some((item) => looseEquals(item, needle ?? null));
      return toText(haystack ?? null).toLowerCase().includes(toText(needle ?? null).toLowerCase());
    }
    case 'startswith': return toText(args[0] ?? null).toLowerCase().startsWith(toText(args[1] ?? null).toLowerCase());
    case 'endswith': return toText(args[0] ?? null).toLowerCase().endsWith(toText(args[1] ?? null).toLowerCase());
    case 'format': {
      const [template, ...rest] = args;
      return toText(template ?? null).replace(/\{(\d+)\}/g, (_, index: string) => toText(rest[Number(index)] ?? null));
    }
    case 'join': {
      const [items, separator] = args;
      return Array.isArray(items) ? items.map(toText).join(separator === undefined ? ',' : toText(separator)) : toText(items ?? null);
    }
    case 'tojson': return JSON.stringify(args[0] ?? null, null, 2);
    case 'fromjson': {
      try { return JSON.parse(toText(args[0] ?? null)) as ExprValue; } catch { throw new ExpressionError('Error parsing fromJson'); }
    }
    case 'hashfiles': return context.hashFiles ? context.hashFiles(args.map(toText)) : '';
    default: throw new ExpressionError(`Unrecognized function: '${name}'`);
  }
}

function lookup(object: Record<string, ExprValue>, key: string): ExprValue {
  if (Object.hasOwn(object, key)) return object[key] ?? null;
  const lower = key.toLowerCase();
  const found = Object.keys(object).find((item) => item.toLowerCase() === lower);
  return found === undefined ? null : object[found] ?? null;
}

function isObject(value: ExprValue): value is ExprObject {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function truthy(value: ExprValue): boolean {
  if (value === null || value === false || value === '' || value === 0) return false;
  if (typeof value === 'number' && Number.isNaN(value)) return false;
  return true;
}

function toNumber(value: ExprValue): number {
  if (value === null) return 0;
  if (typeof value === 'boolean') return value ? 1 : 0;
  if (typeof value === 'number') return value;
  if (typeof value === 'string') return value.trim() === '' ? 0 : Number(value);
  return Number.NaN;
}

function looseEquals(left: ExprValue, right: ExprValue): boolean {
  if (typeof left === 'string' && typeof right === 'string') return left.toLowerCase() === right.toLowerCase();
  if (left === null && right === null) return true;
  if (typeof left === 'object' || typeof right === 'object') return left === right;
  if (typeof left === typeof right) return left === right;
  return toNumber(left) === toNumber(right);
}

/** Converts an expression value to the string GitHub substitutes into YAML. */
export function toText(value: ExprValue): string {
  if (value === null) return '';
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  return JSON.stringify(value, null, 2);
}

/** Replaces every `${{ expr }}` in a template string. */
export function interpolate(template: string, context: ExprContext): string {
  return template.replace(/\$\{\{([\s\S]*?)\}\}/g, (_, expression: string) => toText(evaluateExpression(expression, context)));
}

/** Lists the inner expressions of every `${{ }}` block in a template. */
export function findExpressions(template: string): string[] {
  return [...template.matchAll(/\$\{\{([\s\S]*?)\}\}/g)].map((match) => match[1]!);
}
