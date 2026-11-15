import { stableStringify } from '../kubernetes/util';

/**
 * A small HCL2 subset: blocks, attributes, strings with ${} interpolation,
 * heredocs, lists, objects, references, calls, operators and conditionals.
 */

/** Marker for a value that is only known after apply. */
export const UNKNOWN = { __unknown: true } as const;
export type Unknown = typeof UNKNOWN;
export const isUnknown = (v: unknown): v is Unknown => v === UNKNOWN;
export function hasUnknown(v: unknown): boolean {
  if (isUnknown(v)) return true;
  if (Array.isArray(v)) return v.some(hasUnknown);
  if (v && typeof v === 'object') return Object.values(v as Record<string, unknown>).some(hasUnknown);
  return false;
}

export type Expr =
  | { t: 'lit'; v: unknown }
  | { t: 'tpl'; parts: (string | Expr)[] }
  | { t: 'ref'; root: string; path: (string | number | Expr)[] }
  | { t: 'list'; items: Expr[] }
  | { t: 'obj'; entries: [Expr, Expr][] }
  | { t: 'call'; name: string; args: Expr[] }
  | { t: 'bin'; op: string; l: Expr; r: Expr }
  | { t: 'un'; op: string; e: Expr }
  | { t: 'cond'; c: Expr; a: Expr; b: Expr };

export interface Block {
  type: string;
  labels: string[];
  attrs: Record<string, Expr>;
  blocks: Block[];
  line: number;
  file: string;
}
export interface Body { attrs: Record<string, Expr>; attrLines: Record<string, number>; blocks: Block[] }

export class HclError extends Error {
  constructor(message: string, public file: string, public line: number) { super(message); }
}
export class EvalError extends Error {}

const NAME = /[A-Za-z0-9_-]/;

class Parser {
  i = 0;
  depth = 0;
  constructor(public s: string, public file: string) {}

  line(at = this.i): number { return this.s.slice(0, at).split('\n').length; }
  fail(message: string): never { throw new HclError(message, this.file, this.line()); }
  eof() { return this.i >= this.s.length; }

  skip(newlines: boolean) {
    for (;;) {
      const c = this.s[this.i];
      if (c === ' ' || c === '\t' || c === '\r' || (newlines && c === '\n')) this.i++;
      else if (c === '#' || (c === '/' && this.s[this.i + 1] === '/')) { while (!this.eof() && this.s[this.i] !== '\n') this.i++; }
      else if (c === '/' && this.s[this.i + 1] === '*') {
        const end = this.s.indexOf('*/', this.i + 2);
        if (end < 0) this.fail('Unclosed comment'); else this.i = end + 2;
      } else return;
    }
  }
  sp() { this.skip(this.depth > 0); }
  peek(text: string) { this.sp(); return this.s.startsWith(text, this.i); }
  eat(text: string) { if (this.peek(text)) { this.i += text.length; return true; } return false; }
  expect(text: string) { if (!this.eat(text)) this.fail('Expected "' + text + '" but found ' + (this.eof() ? 'end of file' : `"${this.s[this.i]}"`)); }

  ident(): string {
    this.sp();
    const start = this.i;
    while (!this.eof() && NAME.test(this.s[this.i]!)) this.i++;
    if (start === this.i) this.fail('Invalid character; expected a name');
    return this.s.slice(start, this.i);
  }

  body(root: boolean): Body {
    const out: Body = { attrs: {}, attrLines: {}, blocks: [] };
    for (;;) {
      this.skip(true);
      if (this.eof()) { if (!root) this.fail('Unclosed configuration block'); return out; }
      if (this.s[this.i] === '}') { if (root) this.fail('Unbalanced "}"'); this.i++; return out; }
      const line = this.line();
      const name = this.ident();
      this.skip(false);
      if (this.s[this.i] === '=' && this.s[this.i + 1] !== '=') {
        this.i++;
        if (name in out.attrs) this.fail('Attribute redefined: argument "' + name + '" was already set');
        out.attrs[name] = this.expr();
        out.attrLines[name] = line;
        this.skip(false);
        if (!this.eof() && this.s[this.i] !== '\n' && this.s[this.i] !== '}') this.fail('Missing newline after argument');
        continue;
      }
      const labels: string[] = [];
      for (;;) {
        this.skip(false);
        if (this.s[this.i] === '"') { this.i++; labels.push(this.template('"').map((p) => (typeof p === 'string' ? p : '')).join('')); }
        else if (this.s[this.i] === '{') break;
        else if (NAME.test(this.s[this.i] ?? '')) labels.push(this.ident());
        else this.fail('Invalid block definition; expected an argument name or "{"');
      }
      this.i++;
      const inner = this.body(false);
      out.blocks.push({ type: name, labels, attrs: inner.attrs, blocks: inner.blocks, line, file: this.file });
    }
  }

  // ─── expressions ──────────────────────────────────────────────────────────
  expr(): Expr {
    const c = this.binary(0);
    if (this.eat('?')) {
      const a = this.expr();
      this.expect(':');
      return { t: 'cond', c, a, b: this.expr() };
    }
    return c;
  }
  private static LEVELS = [['||'], ['&&'], ['==', '!='], ['<=', '>=', '<', '>'], ['+', '-'], ['*', '/', '%']];
  binary(level: number): Expr {
    if (level >= Parser.LEVELS.length) return this.unary();
    let left = this.binary(level + 1);
    for (;;) {
      this.sp();
      const op = Parser.LEVELS[level]!.find((o) => this.s.startsWith(o, this.i) && !(o === '<' && this.s.startsWith('<<', this.i)));
      if (!op) return left;
      this.i += op.length;
      left = { t: 'bin', op, l: left, r: this.binary(level + 1) };
    }
  }
  unary(): Expr {
    if (this.peek('!') && !this.peek('!=')) { this.i++; return { t: 'un', op: '!', e: this.unary() }; }
    if (this.peek('-')) { this.i++; return { t: 'un', op: '-', e: this.unary() }; }
    return this.primary();
  }
  primary(): Expr {
    this.sp();
    const c = this.s[this.i];
    if (c === undefined) this.fail('Missing expression');
    if (c === '"') { this.i++; return this.tplExpr(this.template('"')); }
    if (c === '<' && this.s.startsWith('<<', this.i)) return this.heredoc();
    if (c === '(') { this.i++; this.depth++; const e = this.expr(); this.expect(')'); this.depth--; return e; }
    if (c === '[') {
      this.i++; this.depth++;
      const items: Expr[] = [];
      while (!this.peek(']')) { items.push(this.expr()); if (!this.eat(',')) break; }
      this.expect(']'); this.depth--;
      return { t: 'list', items };
    }
    if (c === '{') {
      this.i++; this.depth++;
      const entries: [Expr, Expr][] = [];
      while (!this.peek('}')) {
        let key: Expr;
        if (this.peek('(')) { this.i++; key = this.expr(); this.expect(')'); }
        else if (this.peek('"')) { this.i++; key = this.tplExpr(this.template('"')); }
        else key = { t: 'lit', v: this.ident() };
        if (!this.eat('=') && !this.eat(':')) this.fail('Missing key/value separator');
        entries.push([key, this.expr()]);
        this.eat(',');
      }
      this.expect('}'); this.depth--;
      return { t: 'obj', entries };
    }
    if (/[0-9]/.test(c)) {
      const m = /^\d+(\.\d+)?([eE][+-]?\d+)?/.exec(this.s.slice(this.i))!;
      this.i += m[0].length;
      return { t: 'lit', v: Number(m[0]) };
    }
    if (/[A-Za-z_]/.test(c)) {
      const start = this.i;
      while (!this.eof() && /[A-Za-z0-9_]/.test(this.s[this.i]!)) this.i++;
      const name = this.s.slice(start, this.i);
      if (name === 'true' || name === 'false') return { t: 'lit', v: name === 'true' };
      if (name === 'null') return { t: 'lit', v: null };
      if (this.s[this.i] === '(') {
        this.i++; this.depth++;
        const args: Expr[] = [];
        while (!this.peek(')')) { args.push(this.expr()); if (!this.eat(',')) break; }
        this.expect(')'); this.depth--;
        return { t: 'call', name, args };
      }
      const path: (string | number | Expr)[] = [];
      for (;;) {
        if (this.s[this.i] === '.' && /[A-Za-z0-9_]/.test(this.s[this.i + 1] ?? '')) {
          this.i++;
          const s2 = this.i;
          while (!this.eof() && /[A-Za-z0-9_-]/.test(this.s[this.i]!)) this.i++;
          const seg = this.s.slice(s2, this.i);
          path.push(/^\d+$/.test(seg) ? Number(seg) : seg);
        } else if (this.s[this.i] === '[') {
          this.i++; this.depth++;
          const idx = this.expr();
          this.expect(']'); this.depth--;
          path.push(idx.t === 'lit' && (typeof idx.v === 'string' || typeof idx.v === 'number') ? idx.v : idx);
        } else break;
      }
      return { t: 'ref', root: name, path };
    }
    return this.fail('Invalid expression; expected a value but found "' + c + '"');
  }

  private tplExpr(parts: (string | Expr)[]): Expr {
    if (parts.length === 0) return { t: 'lit', v: '' };
    if (parts.length === 1 && typeof parts[0] === 'string') return { t: 'lit', v: parts[0] };
    return { t: 'tpl', parts };
  }

  /** Read template text up to `term` (or end of input when null). */
  template(term: string | null): (string | Expr)[] {
    const parts: (string | Expr)[] = [];
    let text = '';
    for (;;) {
      if (this.eof()) { if (term) this.fail('Unterminated template string'); break; }
      const c = this.s[this.i]!;
      if (term && c === term) { this.i++; break; }
      if (term && c === '\n') this.fail('Unterminated template string');
      if (c === '$' && this.s[this.i + 1] === '$' && this.s[this.i + 2] === '{') { text += '${'; this.i += 3; continue; }
      if (c === '$' && this.s[this.i + 1] === '{') {
        this.i += 2;
        if (text) { parts.push(text); text = ''; }
        const saved = this.depth;
        this.depth = 1;
        parts.push(this.expr());
        this.sp();
        if (this.s[this.i] !== '}') this.fail('Invalid template interpolation: expected "}"');
        this.i++;
        this.depth = saved;
        continue;
      }
      if (term && c === '\\') {
        const n = this.s[this.i + 1];
        text += n === 'n' ? '\n' : n === 't' ? '\t' : n ?? '';
        this.i += 2;
        continue;
      }
      text += c;
      this.i++;
    }
    if (text) parts.push(text);
    return parts;
  }

  heredoc(): Expr {
    const m = /^<<(-?)([A-Za-z_][A-Za-z0-9_]*)\r?\n/.exec(this.s.slice(this.i));
    if (!m) return this.fail('Invalid heredoc: expected an identifier after "<<"');
    const start = this.i + m[0].length;
    const lines = this.s.slice(start).split('\n');
    const end = lines.findIndex((l) => l.trim() === m[2]);
    if (end < 0) this.fail(`Unterminated heredoc "${m[2]}"`);
    let body = lines.slice(0, end);
    if (m[1]) {
      const indent = Math.min(...body.filter((l) => l.trim()).map((l) => /^\s*/.exec(l)![0].length), Infinity);
      body = body.map((l) => l.slice(Number.isFinite(indent) ? indent : 0));
    }
    this.i = start + lines.slice(0, end + 1).join('\n').length;
    const sub = new Parser(body.join('\n') + (body.length ? '\n' : ''), this.file);
    return this.tplExpr(sub.template(null));
  }
}

export function parseHcl(text: string, file: string): Body {
  return new Parser(text, file).body(true);
}

export function parseExpression(text: string, file = 'expression'): Expr {
  const p = new Parser(text, file);
  const e = p.expr();
  p.skip(true);
  if (!p.eof()) p.fail('Extra characters after expression');
  return e;
}

// ─── evaluation ───────────────────────────────────────────────────────────

export interface Scope { ref(root: string, path: (string | number)[]): unknown }

export function traverse(value: unknown, path: (string | number)[], label: string): unknown {
  let cur = value;
  for (const seg of path) {
    if (isUnknown(cur)) return UNKNOWN;
    if (Array.isArray(cur) && typeof seg === 'number') {
      if (seg >= cur.length) throw new EvalError('Invalid index: the given key does not identify an element in this collection value (' + label + ')');
      cur = cur[seg];
    } else if (cur && typeof cur === 'object' && !Array.isArray(cur) && String(seg) in cur) cur = (cur as Record<string, unknown>)[String(seg)];
    else throw new EvalError('Unsupported attribute: This object does not have an attribute named "' + String(seg) + '".');
  }
  return cur;
}

const asString = (v: unknown): string => (typeof v === 'string' ? v : typeof v === 'number' || typeof v === 'boolean' ? String(v) : v === null ? '' : JSON.stringify(v));
const same = (a: unknown, b: unknown) => stableStringify(a) === stableStringify(b);

const FUNCTIONS: Record<string, (...a: unknown[]) => unknown> = {
  lower: (s) => asString(s).toLowerCase(),
  upper: (s) => asString(s).toUpperCase(),
  trimspace: (s) => asString(s).trim(),
  join: (sep, list) => (list as unknown[]).map(asString).join(sep as string),
  replace: (s, a, b) => asString(s).split(a as string).join(b as string),
  length: (v) => (typeof v === 'string' ? v.length : Array.isArray(v) ? v.length : Object.keys(v as object).length),
  concat: (...lists) => (lists as unknown[][]).flat(),
  merge: (...maps) => ({ ...Object.assign({}, ...(maps as Record<string, unknown>[])) as Record<string, unknown> }),
  keys: (m) => Object.keys(m as object).sort(),
  values: (m) => Object.keys(m as object).sort().map((k) => (m as Record<string, unknown>)[k]),
  toset: (l) => [...new Set(l as unknown[])].sort(),
  tolist: (l) => [...(l as unknown[])],
  tostring: asString,
  tonumber: (v) => Number(v),
  contains: (l, v) => (l as unknown[]).some((x) => same(x, v)),
  element: (l, i) => (l as unknown[])[(i as number) % (l as unknown[]).length],
  coalesce: (...v) => v.find((x) => x !== null && x !== ''),
  min: (...n) => Math.min(...(n as number[])),
  max: (...n) => Math.max(...(n as number[])),
  lookup: (m, k, d) => ((m as Record<string, unknown>)[k as string] ?? d),
  jsonencode: (v) => JSON.stringify(v),
  format: (fmt, ...args) => { let i = 0; return asString(fmt).replace(/%[sdv%]/g, (m) => (m === '%%' ? '%' : asString(args[i++]))); },
};

export function evaluate(e: Expr, scope: Scope): unknown {
  switch (e.t) {
    case 'lit': return e.v;
    case 'tpl': {
      let out = '';
      for (const part of e.parts) {
        if (typeof part === 'string') { out += part; continue; }
        const v = evaluate(part, scope);
        if (isUnknown(v)) return UNKNOWN;
        out += asString(v);
      }
      return out;
    }
    case 'ref': {
      const path: (string | number)[] = [];
      for (const seg of e.path) {
        if (typeof seg === 'object') {
          const v = evaluate(seg, scope);
          if (isUnknown(v)) return UNKNOWN;
          path.push(typeof v === 'number' ? v : asString(v));
        } else path.push(seg);
      }
      return scope.ref(e.root, path);
    }
    case 'list': return e.items.map((i) => evaluate(i, scope));
    case 'obj': {
      const out: Record<string, unknown> = {};
      for (const [k, v] of e.entries) {
        const key = evaluate(k, scope);
        if (isUnknown(key)) return UNKNOWN;
        out[asString(key)] = evaluate(v, scope);
      }
      return out;
    }
    case 'call': {
      const fn = FUNCTIONS[e.name];
      if (!fn) throw new EvalError('Call to unknown function: There is no function named "' + e.name + '".');
      const args = e.args.map((a) => evaluate(a, scope));
      if (args.some(hasUnknown)) return e.name === 'length' && Array.isArray(args[0]) ? args[0].length : UNKNOWN;
      try { return fn(...args); } catch { throw new EvalError('Error in function call: invalid arguments for ' + e.name + '().'); }
    }
    case 'un': {
      const v = evaluate(e.e, scope);
      if (isUnknown(v)) return UNKNOWN;
      return e.op === '!' ? !v : -(v as number);
    }
    case 'cond': {
      const c = evaluate(e.c, scope);
      if (isUnknown(c)) return UNKNOWN;
      return evaluate(c ? e.a : e.b, scope);
    }
    case 'bin': {
      const l = evaluate(e.l, scope);
      const r = evaluate(e.r, scope);
      if (isUnknown(l) || isUnknown(r)) return UNKNOWN;
      const [a, b] = [l as number, r as number];
      switch (e.op) {
        case '+': return a + b;
        case '-': return a - b;
        case '*': return a * b;
        case '/': return a / b;
        case '%': return a % b;
        case '<': return a < b;
        case '>': return a > b;
        case '<=': return a <= b;
        case '>=': return a >= b;
        case '==': return same(l, r);
        case '!=': return !same(l, r);
        case '&&': return Boolean(l) && Boolean(r);
        default: return Boolean(l) || Boolean(r);
      }
    }
  }
}

/** Every reference an expression makes, as `root` plus its leading static path. */
export function exprRefs(e: Expr, out: { root: string; path: (string | number)[] }[] = []): { root: string; path: (string | number)[] }[] {
  switch (e.t) {
    case 'ref': {
      const path: (string | number)[] = [];
      for (const seg of e.path) { if (typeof seg === 'object') exprRefs(seg, out); else path.push(seg); }
      out.push({ root: e.root, path });
      break;
    }
    case 'tpl': for (const p of e.parts) if (typeof p !== 'string') exprRefs(p, out); break;
    case 'list': e.items.forEach((i) => exprRefs(i, out)); break;
    case 'obj': e.entries.forEach(([k, v]) => { exprRefs(k, out); exprRefs(v, out); }); break;
    case 'call': e.args.forEach((a) => exprRefs(a, out)); break;
    case 'bin': exprRefs(e.l, out); exprRefs(e.r, out); break;
    case 'un': exprRefs(e.e, out); break;
    case 'cond': exprRefs(e.c, out); exprRefs(e.a, out); exprRefs(e.b, out); break;
    default: break;
  }
  return out;
}
