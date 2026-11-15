import type { JsonValue } from './types';

/** A service-side error, printed as "An error occurred (Code) when calling the Op operation: ...". */
export class AwsError extends Error {
  constructor(public readonly code: string, message: string) {
    super(message);
  }
}

/** A client-side usage error (exit code 252), printed with the aws usage banner. */
export class UsageError extends Error {}

export const USAGE = `usage: aws [options] <command> <subcommand> [<subcommand> ...] [parameters]
To see help text, you can run:

  aws help
  aws <command> help
  aws <command> <subcommand> help
`;

/** Split a command line like a POSIX shell: quotes, escapes, and nothing else. */
export function tokenize(line: string): string[] {
  const tokens: string[] = [];
  let current = '';
  let inToken = false;
  let quote: '"' | "'" | null = null;
  for (let i = 0; i < line.length; i++) {
    const char = line[i]!;
    if (quote === "'") {
      if (char === "'") quote = null;
      else current += char;
      continue;
    }
    if (quote === '"') {
      if (char === '"') quote = null;
      else if (char === '\\' && i + 1 < line.length && '"\\$`'.includes(line[i + 1]!)) current += line[++i]!;
      else current += char;
      continue;
    }
    if (char === "'" || char === '"') { quote = char; inToken = true; continue; }
    if (char === '\\' && i + 1 < line.length) { current += line[++i]!; inToken = true; continue; }
    if (/\s/.test(char)) {
      if (inToken) { tokens.push(current); current = ''; inToken = false; }
      continue;
    }
    current += char;
    inToken = true;
  }
  if (quote) throw new UsageError('Unterminated quote in command line.');
  if (inToken) tokens.push(current);
  return tokens;
}

/** Quote a value so tokenize() returns it unchanged. */
export function shellQuote(value: string): string {
  if (/^[A-Za-z0-9_./:=,@+-]+$/.test(value)) return value;
  return "'" + value.replace(/'/g, "'\\''") + "'";
}

export type ArgType = 'string' | 'list' | 'bool' | 'int';

export interface ParsedArgs {
  values: Record<string, string | string[] | boolean>;
  positionals: string[];
}

/** Parse "--flag value" style options against a declared spec, rejecting unknown options. */
export function parseArgs(tokens: string[], spec: Record<string, ArgType>): ParsedArgs {
  const values: ParsedArgs['values'] = {};
  const positionals: string[] = [];
  const unknown: string[] = [];
  for (let i = 0; i < tokens.length; i++) {
    const token = tokens[i]!;
    if (!token.startsWith('--')) { positionals.push(token); continue; }
    let name = token.slice(2);
    let inline: string | undefined;
    const eq = name.indexOf('=');
    if (eq >= 0) { inline = name.slice(eq + 1); name = name.slice(0, eq); }
    let type = spec[name];
    let negated = false;
    if (!type && name.startsWith('no-') && spec[name.slice(3)] === 'bool') { name = name.slice(3); type = 'bool'; negated = true; }
    if (!type) {
      unknown.push(token);
      while (i + 1 < tokens.length && !tokens[i + 1]!.startsWith('--')) i++;
      continue;
    }
    if (type === 'bool') { values[name] = !negated; continue; }
    if (type === 'list') {
      const items: string[] = inline !== undefined ? [inline] : [];
      while (i + 1 < tokens.length && !tokens[i + 1]!.startsWith('--')) items.push(tokens[++i]!);
      if (!items.length) throw new UsageError(`aws: error: argument --${name}: expected at least one argument`);
      values[name] = [...(Array.isArray(values[name]) ? values[name] as string[] : []), ...items];
      continue;
    }
    const value = inline ?? tokens[++i];
    if (value === undefined || (inline === undefined && value.startsWith('--'))) throw new UsageError(`aws: error: argument --${name}: expected one argument`);
    if (type === 'int' && !/^-?\d+$/.test(value)) throw new UsageError(`aws: error: argument --${name}: invalid int value: '${value}'`);
    values[name] = value;
  }
  if (unknown.length) throw new UsageError(USAGE + '\nUnknown options: ' + unknown.join(', '));
  return { values, positionals };
}

/**
 * Parse AWS CLI shorthand syntax: `Key=Name,Value=web`, `Status=Enabled`,
 * `Variables={A=1,B=2}`, `ResourceType=vpc,Tags=[{Key=Name,Value=main}]`. JSON is accepted too.
 */
export function parseShorthand(input: string): JsonValue {
  const text = input.trim();
  if (text.startsWith('{') && text.includes('"')) return JSON.parse(text) as JsonValue;
  if (text.startsWith('[') && text.includes('"')) return JSON.parse(text) as JsonValue;
  let pos = 0;
  const peek = () => text[pos];
  const parseScalar = (stops: string): string => {
    let out = '';
    while (pos < text.length && !stops.includes(text[pos]!)) out += text[pos++]!;
    return out.trim();
  };
  const parseValue = (stops: string): JsonValue => {
    if (peek() === '{') {
      pos++;
      const obj = parseObject('}');
      if (peek() !== '}') throw new UsageError('Error parsing parameter: Expected: \'}\', received: \'' + (peek() ?? 'EOF') + '\'');
      pos++;
      return obj;
    }
    if (peek() === '[') {
      pos++;
      const items: JsonValue[] = [];
      while (pos < text.length && peek() !== ']') {
        items.push(parseValue(',]'));
        if (peek() === ',') pos++;
      }
      pos++;
      return items;
    }
    const scalar = parseScalar(stops);
    return scalar;
  };
  const parseObject = (end: string): Record<string, JsonValue> => {
    const obj: Record<string, JsonValue> = {};
    while (pos < text.length && peek() !== end) {
      const key = parseScalar('=,' + end);
      if (peek() !== '=') throw new UsageError(`Error parsing parameter: Expected: '=', received: '${peek() ?? 'EOF'}' for input:\n${text}`);
      pos++;
      obj[key] = parseValue(',' + end);
      if (peek() === ',') pos++;
    }
    return obj;
  };
  if (text.startsWith('{') || text.startsWith('[')) return parseValue('');
  return parseObject('\u0000');
}

/** Coerce shorthand/JSON scalars ("true", "5432") to booleans or numbers where callers expect them. */
export function truthy(value: JsonValue | undefined): boolean {
  return value === true || value === 'true' || value === 'True';
}

// ─── Output formatting ───────────────────────────────────────────────────────

export function formatOutput(value: JsonValue, format: string, title: string): string {
  if (format === 'text') return toText(value) + '\n';
  if (format === 'table') return toTable(value, title);
  if (format === 'yaml') return toYaml(value, 0) + '\n';
  return JSON.stringify(value, null, 4) + '\n';
}

function isObject(value: JsonValue): value is Record<string, JsonValue> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function scalar(value: JsonValue): string {
  if (value === null) return 'None';
  if (typeof value === 'boolean') return value ? 'True' : 'False';
  return typeof value === 'object' ? JSON.stringify(value) : String(value);
}

function toText(value: JsonValue, label = ''): string {
  if (!isObject(value) && !Array.isArray(value)) return scalar(value);
  if (Array.isArray(value)) {
    if (value.every((item) => !isObject(item) && !Array.isArray(item))) return value.map(scalar).join('\t');
    return value.map((item) => toText(item, label)).filter(Boolean).join('\n');
  }
  const scalars = Object.entries(value).filter(([, item]) => !isObject(item) && !Array.isArray(item));
  const nested = Object.entries(value).filter(([, item]) => isObject(item) || Array.isArray(item));
  const lines: string[] = [];
  if (scalars.length) lines.push((label ? label.toUpperCase() + '\t' : '') + scalars.map(([, item]) => scalar(item)).join('\t'));
  for (const [key, item] of nested) {
    const text = toText(item, key.replace(/s$/, ''));
    if (text) lines.push(text);
  }
  return lines.join('\n');
}

function toYaml(value: JsonValue, indent: number): string {
  const pad = ' '.repeat(indent);
  if (Array.isArray(value)) {
    if (!value.length) return '[]';
    return value.map((item) => pad + '- ' + toYaml(item, indent + 2).trimStart()).join('\n');
  }
  if (isObject(value)) {
    const entries = Object.entries(value);
    if (!entries.length) return '{}';
    return entries.map(([key, item]) => {
      if (isObject(item) || (Array.isArray(item) && item.length)) return pad + key + ':\n' + toYaml(item, indent + 2);
      return pad + key + ': ' + toYaml(item, 0);
    }).join('\n');
  }
  if (typeof value === 'string') return /^[\w./:@-]*$/.test(value) && value !== '' ? value : JSON.stringify(value);
  return scalar(value);
}

/** An approximation of the aws cli table renderer: titled boxes, flat arrays become columns. */
function toTable(value: JsonValue, title: string): string {
  const lines: string[] = [];
  const render = (node: JsonValue, heading: string) => {
    if (Array.isArray(node)) {
      const objects = node.filter(isObject);
      if (objects.length && objects.length === node.length) {
        const columns = [...new Set(objects.flatMap((item) => Object.keys(item).filter((key) => !isObject(item[key]!) && !Array.isArray(item[key]))))];
        if (columns.length) {
          const rows = objects.map((item) => columns.map((column) => item[column] === undefined ? '' : scalar(item[column])));
          box(heading, columns, rows);
        }
        for (const item of objects) for (const [key, child] of Object.entries(item)) if (isObject(child) || Array.isArray(child)) render(child, key);
      } else box(heading, [], node.map((item) => [scalar(item)]));
      return;
    }
    if (isObject(node)) {
      const flat = Object.entries(node).filter(([, child]) => !isObject(child) && !Array.isArray(child));
      if (flat.length) box(heading, [], flat.map(([key, child]) => [key, scalar(child)]));
      else box(heading, [], []);
      for (const [key, child] of Object.entries(node)) if (isObject(child) || Array.isArray(child)) render(child, key);
      return;
    }
    box(heading, [], [[scalar(node)]]);
  };
  const box = (heading: string, columns: string[], rows: string[][]) => {
    const widths = (columns.length ? columns : rows[0] ?? ['']).map((_, i) => Math.max(columns[i]?.length ?? 0, ...rows.map((row) => row[i]?.length ?? 0)));
    const inner = Math.max(heading.length + 2, widths.reduce((sum, width) => sum + width + 3, -1) + 2);
    const pad = (text: string, width: number) => text + ' '.repeat(Math.max(0, width - text.length));
    lines.push('-'.repeat(inner + 2));
    const left = Math.floor((inner - heading.length) / 2);
    lines.push('|' + ' '.repeat(left) + heading + ' '.repeat(inner - heading.length - left) + '|');
    lines.push('+' + '-'.repeat(inner) + '+');
    if (columns.length) {
      lines.push('|' + pad(' ' + columns.map((column, i) => pad(column, widths[i]!)).join(' | '), inner) + '|');
      lines.push('+' + '-'.repeat(inner) + '+');
    }
    for (const row of rows) lines.push('|' + pad(' ' + row.map((cell, i) => pad(cell, widths[i]!)).join(' | '), inner) + '|');
    if (rows.length) lines.push('+' + '-'.repeat(inner) + '+');
  };
  render(value, title);
  return lines.join('\n') + '\n';
}

// ─── --query (a small JMESPath subset) ───────────────────────────────────────

/**
 * Supports field access, `[n]`, `[*]`, `[]` flattening, `[?Field=='value']` filters,
 * multiselect lists `[A,B]`, and `length(@)` at the top level.
 */
export function jmesSearch(value: JsonValue, expression: string): JsonValue {
  const expr = expression.trim();
  if (/^length\(@\)$/.test(expr)) return Array.isArray(value) ? value.length : isObject(value) ? Object.keys(value).length : 0;
  const tokens = expr.match(/\[\?[^\]]*\]|\[[^\]]*\]|[^.[\]]+/g) ?? [];
  let current: JsonValue = value;
  let projected = false;
  const applyKey = (node: JsonValue, key: string): JsonValue => (isObject(node) ? node[key] ?? null : null);
  for (const token of tokens) {
    if (token === '[*]' || token === '[]') {
      if (!Array.isArray(current)) return null;
      if (token === '[]' || projected) current = current.flatMap((item) => (Array.isArray(item) ? item : [item]));
      projected = true;
      continue;
    }
    if (token.startsWith('[?')) {
      const match = /^\[\?\s*([\w.]+)\s*(==|!=)\s*['`]([^'`]*)['`]\s*\]$/.exec(token);
      if (!match || !Array.isArray(current)) return null;
      const [, field = '', op, expected] = match;
      current = current.filter((item) => {
        const actual = field.split('.').reduce<JsonValue>((node, key) => applyKey(node, key), item);
        const text = actual === null ? '' : typeof actual === 'string' ? actual : JSON.stringify(actual);
        return op === '==' ? text === expected : text !== expected;
      });
      projected = true;
      continue;
    }
    if (token.startsWith('[')) {
      const inner = token.slice(1, -1).trim();
      if (/^-?\d+$/.test(inner)) {
        if (!Array.isArray(current)) return null;
        const index = Number(inner);
        current = current.at(index) ?? null;
        projected = false;
        continue;
      }
      const keys = inner.split(',').map((key) => key.trim());
      const select = (node: JsonValue): JsonValue => keys.map((key) => applyKey(node, key));
      current = projected && Array.isArray(current) ? current.map(select) : select(current);
      continue;
    }
    if (projected && Array.isArray(current)) {
      current = current.map((item) => applyKey(item, token)).filter((item) => item !== null);
    } else current = applyKey(current, token);
  }
  return current;
}
