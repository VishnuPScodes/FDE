/**
 * Deterministic stand-ins for `pytest` and `ruff check` inside the CI simulator.
 *
 * pytest evaluates simple `assert fn(args) == value` tests against small pure functions
 * (arithmetic `return` bodies with optional local assignments). Anything it cannot evaluate
 * is treated as passing, so levels must keep their test files inside this subset.
 */

export interface PyNumber { kind: 'num'; value: number; float: boolean }
export interface PyString { kind: 'str'; value: string }
export type PyValue = PyNumber | PyString;

class Unsupported extends Error {}

interface PyFunction { name: string; params: string[]; body: string[] }

const WIDTH = 80;
export function banner(text: string, fill = '='): string {
  if (!text) return fill.repeat(WIDTH);
  const inner = ' ' + text + ' ';
  const left = Math.max(1, Math.floor((WIDTH - inner.length) / 2));
  const right = Math.max(1, WIDTH - inner.length - left);
  return fill.repeat(left) + inner + fill.repeat(right);
}

export function pyRepr(value: PyValue): string {
  if (value.kind === 'str') return "'" + value.value.replace(/'/g, "\\'") + "'";
  if (Number.isNaN(value.value)) return 'nan';
  if (value.float && Number.isInteger(value.value)) return value.value.toFixed(1);
  return String(value.value);
}

// ─── Tiny Python arithmetic evaluator ────────────────────────────────────────

type PyToken = { type: 'num'; value: number; float: boolean } | { type: 'str'; value: string } | { type: 'id'; value: string } | { type: 'op'; value: string };

function lex(source: string): PyToken[] {
  const tokens: PyToken[] = [];
  let i = 0;
  while (i < source.length) {
    const char = source[i]!;
    if (/\s/.test(char)) { i++; continue; }
    if (char === '#') break;
    const number = /^(\d[\d_]*)(\.\d*)?([eE][+-]?\d+)?/.exec(source.slice(i));
    if (number) {
      // eslint-disable-next-line @typescript-eslint/prefer-nullish-coalescing -- empty string must fall back as well as undefined (regex group may be empty or undefined)
      tokens.push({ type: 'num', value: Number(number[0].replace(/_/g, '')), float: Boolean(number[2] || number[3]) });
      i += number[0].length;
      continue;
    }
    if (char === '"' || char === "'") {
      const end = source.indexOf(char, i + 1);
      if (end < 0) throw new Unsupported('string');
      tokens.push({ type: 'str', value: source.slice(i + 1, end) });
      i = end + 1;
      continue;
    }
    const ident = /^[A-Za-z_][A-Za-z0-9_.]*/.exec(source.slice(i));
    if (ident) { tokens.push({ type: 'id', value: ident[0] }); i += ident[0].length; continue; }
    const op = ['**', '//', '==', '!=', '<=', '>='].find((item) => source.startsWith(item, i)) ?? ('+-*/%(),<>='.includes(char) ? char : null);
    if (!op) throw new Unsupported(char);
    tokens.push({ type: 'op', value: op });
    i += op.length;
  }
  return tokens;
}

class PyEvaluator {
  private tokens: PyToken[] = [];
  private index = 0;
  constructor(private readonly functions: Map<string, PyFunction>, private readonly depth = 0) {}

  eval(source: string, scope: Map<string, PyValue>): PyValue {
    const saved = { tokens: this.tokens, index: this.index };
    this.tokens = lex(source);
    this.index = 0;
    const value = this.additive(scope);
    if (this.index !== this.tokens.length) throw new Unsupported('trailing');
    this.tokens = saved.tokens;
    this.index = saved.index;
    return value;
  }

  private peekOp(value: string): boolean { const t = this.tokens[this.index]; return t?.type === 'op' && t.value === value; }

  private additive(scope: Map<string, PyValue>): PyValue {
    let left = this.term(scope);
    while (this.peekOp('+') || this.peekOp('-')) {
      const op = (this.tokens[this.index++] as { value: string }).value;
      const right = this.term(scope);
      if (op === '+' && left.kind === 'str' && right.kind === 'str') { left = { kind: 'str', value: left.value + right.value }; continue; }
      const [a, b] = [num(left), num(right)];
      left = { kind: 'num', value: op === '+' ? a.value + b.value : a.value - b.value, float: a.float || b.float };
    }
    return left;
  }

  private term(scope: Map<string, PyValue>): PyValue {
    let left = this.unary(scope);
    while (['*', '/', '//', '%'].some((op) => this.peekOp(op))) {
      const op = (this.tokens[this.index++] as { value: string }).value;
      const [a, b] = [num(left), num(this.unary(scope))];
      if ((op === '/' || op === '//' || op === '%') && b.value === 0) throw new Unsupported('ZeroDivisionError');
      if (op === '*') left = { kind: 'num', value: a.value * b.value, float: a.float || b.float };
      else if (op === '/') left = { kind: 'num', value: a.value / b.value, float: true };
      else if (op === '//') left = { kind: 'num', value: Math.floor(a.value / b.value), float: a.float || b.float };
      else left = { kind: 'num', value: ((a.value % b.value) + b.value) % b.value, float: a.float || b.float };
    }
    return left;
  }

  private unary(scope: Map<string, PyValue>): PyValue {
    if (this.peekOp('-')) { this.index++; const value = num(this.unary(scope)); return { ...value, value: -value.value }; }
    if (this.peekOp('+')) { this.index++; return this.unary(scope); }
    const base = this.atom(scope);
    if (this.peekOp('**')) {
      this.index++;
      const exponent = num(this.unary(scope));
      const b = num(base);
      return { kind: 'num', value: b.value ** exponent.value, float: b.float || exponent.float || exponent.value < 0 };
    }
    return base;
  }

  private atom(scope: Map<string, PyValue>): PyValue {
    const token = this.tokens[this.index++];
    if (!token) throw new Unsupported('eof');
    if (token.type === 'num') return { kind: 'num', value: token.value, float: token.float };
    if (token.type === 'str') return { kind: 'str', value: token.value };
    if (token.type === 'op') {
      if (token.value !== '(') throw new Unsupported(token.value);
      const value = this.additive(scope);
      if (!this.peekOp(')')) throw new Unsupported(')');
      this.index++;
      return value;
    }
    if (token.value === 'True' || token.value === 'False') return { kind: 'num', value: token.value === 'True' ? 1 : 0, float: false };
    if (this.peekOp('(')) {
      this.index++;
      const args: PyValue[] = [];
      if (!this.peekOp(')')) {
        for (;;) {
          args.push(this.additive(scope));
          if (this.peekOp(',')) { this.index++; continue; }
          break;
        }
      }
      if (!this.peekOp(')')) throw new Unsupported(')');
      this.index++;
      return this.call(token.value, args);
    }
    const value = scope.get(token.value);
    if (!value) throw new Unsupported('name ' + token.value);
    return value;
  }

  call(name: string, args: PyValue[]): PyValue {
    const short = name.split('.').at(-1)!;
    if (short === 'round' && name === 'round') {
      const value = num(args[0]);
      if (args.length < 2) return { kind: 'num', value: bankersRound(value.value), float: false };
      const digits = num(args[1]).value;
      return { kind: 'num', value: Number(value.value.toFixed(digits)), float: true };
    }
    if (name === 'abs') { const value = num(args[0]); return { ...value, value: Math.abs(value.value) }; }
    if (name === 'int') return { kind: 'num', value: Math.trunc(num(args[0]).value), float: false };
    if (name === 'float') return { kind: 'num', value: num(args[0]).value, float: true };
    if (name === 'min' || name === 'max') {
      const values = args.map(num);
      const pick = values.reduce((best, item) => (name === 'min' ? item.value < best.value : item.value > best.value) ? item : best);
      return pick;
    }
    const fn = this.functions.get(short);
    if (!fn || this.depth > 20) throw new Unsupported('function ' + name);
    const scope = new Map<string, PyValue>();
    fn.params.forEach((param, index) => {
      const [paramName, fallback] = param.split('=').map((part) => part.trim());
      const cleanName = (paramName ?? '').split(':')[0]!.trim();
      const value = args[index] ?? (fallback ? new PyEvaluator(this.functions, this.depth + 1).eval(fallback, new Map()) : undefined);
      if (!value) throw new Unsupported('missing argument');
      scope.set(cleanName, value);
    });
    const evaluator = new PyEvaluator(this.functions, this.depth + 1);
    for (const line of fn.body) {
      const ret = /^return\s+(.+)$/.exec(line);
      if (ret) return evaluator.eval(ret[1]!, scope);
      const assign = /^([A-Za-z_]\w*)\s*(?::\s*[\w[\], ]+)?=\s*(.+)$/.exec(line);
      if (assign && !assign[2]!.startsWith('=')) { scope.set(assign[1]!, evaluator.eval(assign[2]!, scope)); continue; }
      throw new Unsupported('statement');
    }
    throw new Unsupported('no return');
  }
}

function num(value: PyValue | undefined): PyNumber {
  if (value?.kind !== 'num') throw new Unsupported('not a number');
  return value;
}

function bankersRound(value: number): number {
  const floor = Math.floor(value);
  const diff = value - floor;
  if (Math.abs(diff - 0.5) < 1e-9) return floor % 2 === 0 ? floor : floor + 1;
  return Math.round(value);
}

function equal(a: PyValue, b: PyValue): boolean {
  if (a.kind === 'num' && b.kind === 'num') return a.value === b.value;
  if (a.kind === 'str' && b.kind === 'str') return a.value === b.value;
  return false;
}

// ─── Source parsing ──────────────────────────────────────────────────────────

function stripDocstrings(lines: string[]): string[] {
  const out: string[] = [];
  let inDoc = false;
  for (const line of lines) {
    const trimmed = line.trim();
    if (inDoc) { if (trimmed.endsWith('"""') || trimmed.endsWith("'''")) inDoc = false; continue; }
    if (trimmed.startsWith('"""') || trimmed.startsWith("'''")) {
      const quote = trimmed.slice(0, 3);
      if (!(trimmed.length > 3 && trimmed.endsWith(quote))) inDoc = true;
      continue;
    }
    out.push(line);
  }
  return out;
}

function parseFunctions(source: string): PyFunction[] {
  const lines = source.split(/\r?\n/);
  const functions: PyFunction[] = [];
  for (let i = 0; i < lines.length; i++) {
    const match = /^def\s+(\w+)\s*\((.*)\)\s*(->\s*[^:]+)?:\s*(#.*)?$/.exec(lines[i]!);
    if (!match) continue;
    const body: string[] = [];
    let j = i + 1;
    while (j < lines.length && (lines[j]!.trim() === '' || /^\s+/.test(lines[j]!))) { body.push(lines[j]!); j++; }
    const params = match[2]!.split(',').map((item) => item.trim()).filter(Boolean);
    functions.push({ name: match[1]!, params, body: stripDocstrings(body).map((line) => line.replace(/#.*$/, '').trim()).filter(Boolean) });
  }
  return functions;
}

interface TestCase { file: string; name: string; defLine: number; lines: { text: string; line: number }[] }

function parseTests(file: string, source: string): TestCase[] {
  const lines = source.split(/\r?\n/);
  const tests: TestCase[] = [];
  for (let i = 0; i < lines.length; i++) {
    const match = /^def\s+(test_\w*)\s*\(\s*\)\s*(->\s*None\s*)?:/.exec(lines[i]!);
    if (!match) continue;
    const body: { text: string; line: number }[] = [];
    let j = i + 1;
    while (j < lines.length && (lines[j]!.trim() === '' || /^\s+/.test(lines[j]!))) {
      if (lines[j]!.trim()) body.push({ text: lines[j]!.trim(), line: j + 1 });
      j++;
    }
    tests.push({ file, name: match[1]!, defLine: i + 1, lines: body });
  }
  return tests;
}

function isTestFile(path: string): boolean {
  return /(^|\/)(test_[^/]*|[^/]*_test)\.py$/.test(path);
}

// ─── pytest ──────────────────────────────────────────────────────────────────

export interface PytestOptions { files: Record<string, string>; pythonVersion: string; args: string[]; workspace: string }
export interface ToolResult { lines: string[]; code: number }

function versionAtLeast(version: string, major: number, minor: number): boolean {
  const [a = 0, b = 0] = version.split('.').map(Number);
  return a > major || (a === major && b >= minor);
}

export function runPytest({ files, pythonVersion, args, workspace }: PytestOptions): ToolResult {
  const paths = args.filter((arg) => !arg.startsWith('-'));
  const inScope = (path: string) => paths.length === 0 || paths.some((target) => target === '.' || path === target || path.startsWith(target.replace(/\/$/, '') + '/'));
  const testFiles = Object.keys(files).filter((path) => isTestFile(path) && inScope(path)).sort();
  const header = [
    banner('test session starts'),
    `platform linux -- Python ${pythonVersion}, pytest-8.3.3, pluggy-1.5.0`,
    `rootdir: ${workspace}`,
  ];
  for (const path of paths) {
    if (path !== '.' && !Object.keys(files).some((file) => file === path || file.startsWith(path.replace(/\/$/, '') + '/'))) {
      return { lines: [...header, 'collected 0 items', '', banner('no tests ran in 0.01s'), `ERROR: file or directory not found: ${path}`, ''], code: 4 };
    }
  }
  const functions = new Map<string, PyFunction>();
  for (const [path, source] of Object.entries(files)) {
    if (!path.endsWith('.py')) continue;
    for (const fn of parseFunctions(source)) functions.set(fn.name, fn);
  }
  // Modules that need a newer Python fail at import time.
  if (!versionAtLeast(pythonVersion, 3, 11)) {
    const needsToml = Object.entries(files).find(([path, source]) => path.endsWith('.py') && /^\s*(import tomllib|from tomllib import)/m.test(source));
    if (needsToml && testFiles.length) {
      const victim = testFiles[0]!;
      return {
        lines: [...header, 'collected 0 items / 1 error', '', banner('ERRORS'), banner(`ERROR collecting ${victim}`, '_'),
          `ImportError while importing test module '${workspace}/${victim}'.`,
          'Hint: make sure your test modules/packages have valid Python names.',
          'Traceback:',
          `/opt/hostedtoolcache/Python/${pythonVersion}/x64/lib/python${pythonVersion.split('.').slice(0, 2).join('.')}/importlib/__init__.py:126: in import_module`,
          '    return _bootstrap._gcd_import(name[level:], package, level)',
          `${needsToml[0]}:1: in <module>`,
          '    import tomllib',
          "E   ModuleNotFoundError: No module named 'tomllib'",
          banner('short test summary info'),
          `ERROR ${victim}`,
          banner('Interrupted: 1 error during collection', '!'),
          banner('1 error in 0.21s'), ''],
        code: 2,
      };
    }
  }
  const tests = testFiles.flatMap((path) => parseTests(path, files[path] ?? ''));
  if (tests.length === 0) return { lines: [...header, 'collected 0 items', '', banner('no tests ran in 0.01s'), ''], code: 5 };
  const evaluator = new PyEvaluator(functions);
  const failures: { test: TestCase; lines: string[]; summary: string }[] = [];
  const marks = new Map<string, string>();
  for (const test of tests) {
    let failure: { lines: string[]; summary: string } | null = null;
    const scope = new Map<string, PyValue>();
    for (const { text, line } of test.lines) {
      const assertion = /^assert\s+(.+?)\s*==\s*(.+?)(\s*,\s*(["']).*\4)?$/.exec(text);
      try {
        if (assertion) {
          const left = evaluator.eval(assertion[1]!, scope);
          const right = evaluator.eval(assertion[2]!, scope);
          if (!equal(left, right)) {
            const where = /^[\w.]+\(.*\)$/.test(assertion[1]!) ? [`E        +  where ${pyRepr(left)} = ${assertion[1]}`] : [];
            failure = {
              lines: [
                '', `    def ${test.name}():`,
                ...test.lines.filter((item) => item.line < line).map((item) => '        ' + item.text),
                `>       ${text}`,
                `E       assert ${pyRepr(left)} == ${pyRepr(right)}`,
                ...where, '', `${test.file}:${line}: AssertionError`,
              ],
              summary: `FAILED ${test.file}::${test.name} - assert ${pyRepr(left)} == ${pyRepr(right)}`,
            };
            break;
          }
          continue;
        }
        const assign = /^([A-Za-z_]\w*)\s*=\s*(.+)$/.exec(text);
        if (assign && !assign[2]!.startsWith('=')) scope.set(assign[1]!, evaluator.eval(assign[2]!, scope));
      } catch (error) {
        if (!(error instanceof Unsupported)) throw error;
        if (error.message === 'ZeroDivisionError') {
          failure = { lines: ['', `>       ${text}`, 'E       ZeroDivisionError: division by zero', '', `${test.file}:${line}: ZeroDivisionError`], summary: `FAILED ${test.file}::${test.name} - ZeroDivisionError: division by zero` };
          break;
        }
      }
    }
    marks.set(test.file, (marks.get(test.file) ?? '') + (failure ? 'F' : '.'));
    if (failure) failures.push({ test, ...failure });
  }
  const lines = [...header, `collected ${tests.length} item${tests.length === 1 ? '' : 's'}`, ''];
  let done = 0;
  for (const [file, mark] of marks) {
    done += mark.length;
    const percent = `[${String(Math.round((done / tests.length) * 100)).padStart(3)}%]`;
    const left = `${file} ${mark}`;
    lines.push(left + ' '.repeat(Math.max(1, WIDTH - left.length - percent.length)) + percent);
  }
  lines.push('');
  const passed = tests.length - failures.length;
  const seconds = (0.03 + tests.length * 0.01).toFixed(2);
  if (failures.length) {
    lines.push(banner('FAILURES'));
    for (const failure of failures) lines.push(banner(failure.test.name, '_'), ...failure.lines);
    lines.push(banner('short test summary info'), ...failures.map((item) => item.summary));
    lines.push(banner(`${failures.length} failed${passed ? `, ${passed} passed` : ''} in ${seconds}s`));
    return { lines, code: 1 };
  }
  lines.push(banner(`${passed} passed in ${seconds}s`));
  return { lines, code: 0 };
}

// ─── ruff / flake8 ───────────────────────────────────────────────────────────

interface LintIssue { file: string; line: number; col: number; name: string }

function findUnusedImports(files: Record<string, string>, scope: string[]): LintIssue[] {
  const issues: LintIssue[] = [];
  const inScope = (path: string) => scope.length === 0 || scope.some((target) => target === '.' || path === target || path.startsWith(target.replace(/\/$/, '') + '/'));
  for (const path of Object.keys(files).sort()) {
    if (!path.endsWith('.py') || !inScope(path)) continue;
    const lines = (files[path] ?? '').split(/\r?\n/);
    lines.forEach((text, index) => {
      const names: { name: string; col: number }[] = [];
      const plain = /^import\s+([\w.]+)(\s+as\s+(\w+))?\s*$/.exec(text);
      const from = /^from\s+[\w.]+\s+import\s+(.+)$/.exec(text);
      if (plain) {
        const name = plain[3] ?? plain[1]!.split('.')[0]!;
        // eslint-disable-next-line @typescript-eslint/prefer-nullish-coalescing -- empty string must fall back as well as undefined (regex group may be empty or undefined)
        names.push({ name: plain[3] ? plain[3] : plain[1]!, col: text.indexOf(plain[1]!) + 1 });
        names[names.length - 1]!.name = name;
      } else if (from && !from[1]!.includes('(') && from[1]!.trim() !== '*') {
        let offset = text.indexOf(from[1]!);
        for (const part of from[1]!.split(',')) {
          const piece = /^(\s*)([\w]+)(\s+as\s+(\w+))?\s*$/.exec(part);
          if (piece) names.push({ name: piece[4] ?? piece[2]!, col: offset + piece[1]!.length + 1 });
          offset += part.length + 1;
        }
      }
      if (!names.length) return;
      const rest = lines.filter((_, other) => other !== index).join('\n');
      for (const item of names) {
        if (!new RegExp('\\b' + item.name + '\\b').test(rest)) issues.push({ file: path, line: index + 1, col: item.col, name: item.name });
      }
    });
  }
  return issues;
}

export function runRuff(files: Record<string, string>, args: string[]): ToolResult {
  const sub = args[0];
  const scope = args.slice(1).filter((arg) => !arg.startsWith('-'));
  if (sub === 'format') {
    const count = Object.keys(files).filter((path) => path.endsWith('.py')).length;
    return { lines: [`${count} files already formatted`], code: 0 };
  }
  if (sub !== 'check') return { lines: [`error: unrecognized subcommand '${sub ?? ''}'`, '', 'Usage: ruff [OPTIONS] <COMMAND>'], code: 2 };
  const issues = findUnusedImports(files, scope);
  if (!issues.length) return { lines: ['All checks passed!'], code: 0 };
  return {
    lines: [
      ...issues.map((issue) => `${issue.file}:${issue.line}:${issue.col}: F401 [*] \`${issue.name}\` imported but unused`),
      `Found ${issues.length} error${issues.length === 1 ? '' : 's'}.`,
      `[*] ${issues.length} fixable with the \`--fix\` option.`,
    ],
    code: 1,
  };
}

export function runFlake8(files: Record<string, string>, args: string[]): ToolResult {
  const issues = findUnusedImports(files, args.filter((arg) => !arg.startsWith('-')));
  return { lines: issues.map((issue) => `./${issue.file}:${issue.line}:1: F401 '${issue.name}' imported but unused`), code: issues.length ? 1 : 0 };
}

/** Names read with os.environ["NAME"] that are missing from env cause a KeyError, like real Python. */
export function runPythonScript(path: string, source: string, env: Record<string, string>, pythonVersion: string): ToolResult {
  const lines = source.split(/\r?\n/);
  for (let i = 0; i < lines.length; i++) {
    const match = /os\.environ\[\s*["'](\w+)["']\s*\]/.exec(lines[i]!);
    if (match && !env[match[1]!]) {
      return {
        lines: ['Traceback (most recent call last):', `  File "${path}", line ${i + 1}, in <module>`, `    ${lines[i]!.trim()}`,
          `  File "<frozen os>", line 714, in __getitem__`, `KeyError: '${match[1]}'`],
        code: 1,
      };
    }
  }
  const printed: string[] = [];
  for (const line of lines) {
    const print = /^print\(\s*(["'])(.*)\1\s*\)\s*$/.exec(line.trim());
    if (print) printed.push(print[2]!);
  }
  if (!versionAtLeast(pythonVersion, 3, 11) && /^\s*import tomllib/m.test(source)) {
    return { lines: ['Traceback (most recent call last):', `  File "${path}", line 1, in <module>`, "ModuleNotFoundError: No module named 'tomllib'"], code: 1 };
  }
  return { lines: printed, code: 0 };
}
