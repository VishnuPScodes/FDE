import { clone, stableStringify, tokenize } from '../kubernetes/util';
import {
  EvalError, HclError, UNKNOWN, evaluate, exprRefs, hasUnknown, isUnknown, parseExpression, parseHcl, traverse,
  type Block, type Expr, type Scope,
} from './hcl';
import { SCHEMAS, applyError, type ResourceSchema } from './providers';

// ─── Types ──────────────────────────────────────────────────────────────────

export interface TfResource {
  address: string; type: string; name: string; key?: string | number;
  attrs: Record<string, unknown>; deps: string[]; tainted?: boolean;
}
export interface TfState {
  files: Record<string, string>;
  resources: TfResource[];
  outputs: Record<string, { value: unknown; sensitive: boolean }>;
  /** Out-of-band changes made "in the console" that Terraform has not refreshed yet. */
  cloud: Record<string, Record<string, unknown>>;
  initialized: boolean;
  serial: number;
  seq: number;
  savedPlans: Record<string, string>;
  history: string[];
  stdout: string;
  stderr: string;
  lastError: string;
}
export interface TfResult { state: TfState; stdout: string; stderr: string; exitCode: number }

export const STATE_FILE = 'terraform.tfstate';
const META_ATTRS = ['count', 'for_each', 'depends_on', 'provider'];

interface RBlock {
  type: string; name: string; key: string; line: number; file: string; schema: ResourceSchema;
  attrs: Record<string, Expr>; blocks: Block[]; mode: 'single' | 'count' | 'each';
  lifecycle: { preventDestroy: boolean; ignore: string[] }; deps: string[];
}
interface VarDef { name: string; type: string; def?: Expr; sensitive: boolean; validations: { cond: Expr; msg: Expr; line: number }[]; line: number; file: string }
interface OutDef { name: string; expr: Expr; sensitive: boolean; line: number; file: string }
interface Config {
  resources: RBlock[]; variables: Record<string, VarDef>; locals: Record<string, Expr>; outputs: OutDef[];
  region: string; providers: string[]; warnings: string[];
}

export function createTfState(files: Record<string, string> = {}): TfState {
  const state: TfState = { files: { ...files }, resources: [], outputs: {}, cloud: {}, initialized: false, serial: 0, seq: 0, savedPlans: {}, history: [], stdout: '', stderr: '', lastError: '' };
  try {
    const seed = JSON.parse(files[STATE_FILE] ?? '') as { resources?: Partial<TfResource>[]; pending_console_changes?: TfState['cloud']; serial?: number };
    for (const r of seed.resources ?? []) if (r.address && r.type && r.name) state.resources.push({ address: r.address, type: r.type, name: r.name, attrs: r.attrs ?? {}, deps: r.deps ?? [] });
    state.cloud = seed.pending_console_changes ?? {};
    state.serial = seed.serial ?? 0;
    if (state.resources.length) state.initialized = false;
    mirror(state);
  } catch { /* no seed state */ }
  return state;
}

function mirror(st: TfState) {
  st.files[STATE_FILE] = JSON.stringify({ version: 4, terraform_version: '1.8.5', serial: st.serial, resources: st.resources.map((r) => ({ address: r.address, type: r.type, name: r.name, attrs: r.attrs, deps: r.deps, ...(r.tainted ? { tainted: true } : {}) })) }, null, 2) + '\n';
}

// ─── Diagnostics ────────────────────────────────────────────────────────────

function diag(st: TfState, level: 'Error' | 'Warning', summary: string, detail = '', loc?: { file: string; line: number }): string {
  let out = level + ': ' + summary + '\n';
  if (loc) out += `\n  on ${loc.file} line ${loc.line}:\n   ${loc.line}: ${((st.files[loc.file] ?? '').split('\n')[loc.line - 1] ?? '').trim()}\n`;
  if (detail) out += '\n' + detail + '\n';
  return out;
}

// ─── Configuration ──────────────────────────────────────────────────────────

function blockExprs(b: { attrs: Record<string, Expr>; blocks: Block[] }): Expr[] {
  return [...Object.values(b.attrs), ...b.blocks.flatMap((x) => blockExprs(x))];
}

function loadConfig(st: TfState): { cfg: Config } | { errors: string[] } {
  const errors: string[] = [];
  const cfg: Config = { resources: [], variables: {}, locals: {}, outputs: [], region: 'ap-south-1', providers: [], warnings: [] };
  const files = Object.keys(st.files).filter((f) => f.endsWith('.tf')).sort();
  if (!files.length) return { errors: [diag(st, 'Error', 'No configuration files', 'Terraform expects at least one .tf file in this directory. Create main.tf first.')] };
  const seen = new Set<string>();
  for (const file of files) {
    let body;
    try { body = parseHcl(st.files[file]!, file); } catch (e) {
      if (e instanceof HclError) { errors.push(diag(st, 'Error', 'Argument or block definition required', e.message, { file: e.file, line: e.line })); continue; }
      throw e;
    }
    for (const b of body.blocks) {
      const loc = { file, line: b.line };
      if (b.type === 'resource') {
        if (b.labels.length !== 2) { errors.push(diag(st, 'Error', 'Invalid block definition', 'A resource block requires two labels: the resource type and a name.', loc)); continue; }
        const [type, name] = b.labels as [string, string];
        const schema = SCHEMAS[type];
        if (!schema) { errors.push(diag(st, 'Error', 'Invalid resource type', 'The provider hashicorp/aws does not support resource type "' + type + '".', loc)); continue; }
        if (seen.has(type + '.' + name)) { errors.push(diag(st, 'Error', 'Duplicate resource "' + type + '" configuration', 'A aws_ resource named "' + name + '" was already declared.', loc)); continue; }
        seen.add(type + '.' + name);
        const lc = b.blocks.find((x) => x.type === 'lifecycle');
        const ignore = lc?.attrs.ignore_changes?.t === 'list' ? lc.attrs.ignore_changes.items.flatMap((i) => (i.t === 'ref' ? [i.root] : [])) : [];
        const prevent = lc?.attrs.prevent_destroy?.t === 'lit' && lc.attrs.prevent_destroy.v === true;
        const mode = b.attrs.for_each ? 'each' : b.attrs.count ? 'count' : 'single';
        const rb: RBlock = { type, name, key: type + '.' + name, line: b.line, file, schema, attrs: b.attrs, blocks: b.blocks.filter((x) => x.type !== 'lifecycle'), mode, lifecycle: { preventDestroy: prevent, ignore }, deps: [] };
        for (const attr of Object.keys(b.attrs)) {
          if (META_ATTRS.includes(attr) || attr in schema.optional || schema.required.includes(attr)) continue;
          errors.push(diag(st, 'Error', 'Unsupported argument', 'An argument named "' + attr + '" is not expected here.', { file, line: b.line }));
        }
        for (const nb of rb.blocks) if (!schema.blocks.includes(nb.type)) errors.push(diag(st, 'Error', 'Unsupported block type', 'Blocks of type "' + nb.type + '" are not expected here.', { file, line: nb.line }));
        for (const req of schema.required) if (!(req in b.attrs)) errors.push(diag(st, 'Error', 'Missing required argument', 'The argument "' + req + '" is required, but no definition was found.', loc));
        cfg.resources.push(rb);
      } else if (b.type === 'variable') {
        const name = b.labels[0] ?? '';
        const t = b.attrs.type;
        const type = t?.t === 'ref' ? t.root : t?.t === 'call' ? t.name : '';
        cfg.variables[name] = {
          name, type, def: b.attrs.default, sensitive: b.attrs.sensitive?.t === 'lit' && b.attrs.sensitive.v === true, line: b.line, file,
          validations: b.blocks.filter((x) => x.type === 'validation' && x.attrs.condition && x.attrs.error_message).map((x) => ({ cond: x.attrs.condition!, msg: x.attrs.error_message!, line: x.line })),
        };
      } else if (b.type === 'output') {
        if (!b.attrs.value) errors.push(diag(st, 'Error', 'Missing required argument', 'The argument "value" is required, but no definition was found.', loc));
        else cfg.outputs.push({ name: b.labels[0] ?? '', expr: b.attrs.value, sensitive: b.attrs.sensitive?.t === 'lit' && b.attrs.sensitive.v === true, line: b.line, file });
      } else if (b.type === 'locals') Object.assign(cfg.locals, b.attrs);
      else if (b.type === 'provider') {
        cfg.providers.push(b.labels[0] ?? '');
        const region = b.attrs.region;
        if (region?.t === 'lit' && typeof region.v === 'string') cfg.region = region.v;
      } else if (b.type === 'terraform') { /* settings are accepted and ignored */ }
      else if (b.type === 'data' || b.type === 'module') errors.push(diag(st, 'Error', 'Unsupported block type', 'This simulator supports resource, variable, output, locals and provider blocks. "' + b.type + '" blocks are not available.', loc));
      else errors.push(diag(st, 'Error', 'Unsupported block type', 'Blocks of type "' + b.type + '" are not expected here.', loc));
    }
  }
  // Reference checks and dependency edges.
  const keys = new Set(cfg.resources.map((r) => r.key));
  const check = (exprs: Expr[], loc: { file: string; line: number }, owner?: RBlock) => {
    for (const e of exprs) for (const ref of exprCollect(e)) {
      if (ref.root === 'var') { if (!(String(ref.path[0]) in cfg.variables)) errors.push(diag(st, 'Error', 'Reference to undeclared input variable', 'An input variable with the name "' + String(ref.path[0]) + '" has not been declared. Did you mean to declare a variable "' + String(ref.path[0]) + '"?', loc)); }
      else if (ref.root === 'local') { if (!(String(ref.path[0]) in cfg.locals)) errors.push(diag(st, 'Error', 'Reference to undeclared local value', 'A local value with the name "' + String(ref.path[0]) + '" has not been declared.', loc)); }
      else if (['each', 'count', 'path', 'self'].includes(ref.root)) continue;
      else if (!keys.has(ref.root + '.' + String(ref.path[0]))) errors.push(diag(st, 'Error', 'Reference to undeclared resource', 'A managed resource "' + ref.root + '" "' + String(ref.path[0]) + '" has not been declared in the root module.', loc));
      else if (owner && !owner.deps.includes(ref.root + '.' + String(ref.path[0]))) owner.deps.push(ref.root + '.' + String(ref.path[0]));
    }
  };
  for (const r of cfg.resources) check(blockExprs(r), { file: r.file, line: r.line }, r);
  for (const o of cfg.outputs) check([o.expr], o);
  for (const l of Object.values(cfg.locals)) check([l], { file: files[0]!, line: 1 });
  return errors.length ? { errors } : { cfg };
}

const exprCollect = (e: Expr) => exprRefs(e);

// ─── Variables ──────────────────────────────────────────────────────────────

function coerce(value: unknown, type: string): unknown {
  if (type === 'number' && typeof value === 'string' && value.trim() !== '' && !Number.isNaN(Number(value))) return Number(value);
  if (type === 'bool' && (value === 'true' || value === 'false')) return value === 'true';
  if (type === 'string' && (typeof value === 'number' || typeof value === 'boolean')) return String(value);
  return value;
}

function resolveVariables(st: TfState, cfg: Config, cli: Record<string, string>, varFiles: string[]): { vars: Record<string, unknown>; errors: string[] } {
  const errors: string[] = [];
  const given: Record<string, unknown> = {};
  const auto = Object.keys(st.files).filter((f) => f === 'terraform.tfvars' || f.endsWith('.auto.tfvars')).sort();
  for (const file of [...auto, ...varFiles]) {
    if (!(file in st.files)) { errors.push(diag(st, 'Error', 'Failed to read variables file', 'Given variables file ' + file + ' does not exist.')); continue; }
    try {
      for (const [k, e] of Object.entries(parseHcl(st.files[file]!, file).attrs)) {
        if (!(k in cfg.variables)) cfg.warnings.push(diag(st, 'Warning', 'Value for undeclared variable', 'The root module does not declare a variable named "' + k + '" but a value was found in file "' + file + '". If you meant to use this value, add a "variable" block to the configuration.'));
        else given[k] = evaluate(e, { ref: () => { throw new EvalError('Variables may not be used here.'); } });
      }
    } catch (e) { errors.push(diag(st, 'Error', 'Invalid variables file', (e as Error).message, e instanceof HclError ? { file, line: e.line } : undefined)); }
  }
  for (const [k, raw] of Object.entries(cli)) {
    const def = cfg.variables[k];
    if (!def) { errors.push(diag(st, 'Error', 'Value for undeclared variable', 'A variable named "' + k + '" was assigned on the command line, but the root module does not declare a variable of that name.')); continue; }
    if (['list', 'set', 'map', 'object', 'tuple', 'number', 'bool'].includes(def.type)) {
      try { given[k] = evaluate(parseExpression(raw), { ref: () => { throw new EvalError('x'); } }); } catch { errors.push(diag(st, 'Error', 'Invalid value for input variable', 'The given value is not valid for variable "' + k + '": a ' + def.type + ' is required.')); }
    } else given[k] = raw;
  }
  const vars: Record<string, unknown> = {};
  for (const def of Object.values(cfg.variables)) {
    const loc = { file: def.file, line: def.line };
    if (def.name in given) vars[def.name] = coerce(given[def.name], def.type);
    else if (def.def) vars[def.name] = coerce(evaluate(def.def, { ref: () => UNKNOWN }), def.type);
    else { errors.push(diag(st, 'Error', 'No value for required variable', 'The root module input variable "' + def.name + '" is not set, and has no default value. Use a -var or -var-file command line argument to provide a value for this variable.', loc)); continue; }
    for (const v of def.validations) {
      let ok = true;
      try { ok = Boolean(evaluate(v.cond, { ref: (root, path) => (root === 'var' ? traverse(vars[String(path[0])], path.slice(1), 'var') : UNKNOWN) })); } catch { ok = false; }
      if (!ok) errors.push(diag(st, 'Error', 'Invalid value for variable', `${String(evaluate(v.msg, { ref: () => '' }))}\n\nThis was checked by the validation rule at ${def.file}:${v.line}.`, loc));
    }
  }
  return { vars, errors };
}

// ─── Evaluation scope ───────────────────────────────────────────────────────

interface Inst { mode: 'single' | 'count' | 'each'; byKey: Map<string, Record<string, unknown>> }
type Lookup = (blockKey: string) => Inst | undefined;

function makeScope(cfg: Config, vars: Record<string, unknown>, lookup: Lookup, each?: { key: string; value: unknown }, count?: number): Scope {
  const localCache: Record<string, unknown> = {};
  const active = new Set<string>();
  const scope: Scope = {
    ref(root, path) {
      if (root === 'var') return traverse(vars[String(path[0])], path.slice(1), 'var.' + String(path[0]));
      if (root === 'local') {
        const name = String(path[0]);
        if (!(name in localCache)) {
          if (active.has(name)) throw new EvalError('Cycle between local values: ' + name);
          active.add(name);
          localCache[name] = evaluate(cfg.locals[name]!, scope);
          active.delete(name);
        }
        return traverse(localCache[name], path.slice(1), 'local.' + name);
      }
      if (root === 'each') { if (!each) throw new EvalError('Reference to "each" in context without for_each'); return traverse({ key: each.key, value: each.value }, path, 'each'); }
      if (root === 'count') { if (count === undefined) throw new EvalError('Reference to "count" in non-counted context'); return traverse({ index: count }, path, 'count'); }
      if (root === 'path') return traverse({ module: '.', root: '.', cwd: '.' }, path, 'path');
      const inst = lookup(root + '.' + String(path[0]));
      if (!inst) return UNKNOWN;
      const rest = path.slice(1);
      if (!rest.length && inst.mode !== 'single') return inst.mode === 'each' ? Object.fromEntries(inst.byKey) : [...inst.byKey.values()];
      if (inst.mode === 'single') return traverse(inst.byKey.get('') ?? UNKNOWN, rest, root);
      const attrs = inst.byKey.get(String(rest[0]));
      if (attrs === undefined) throw new EvalError('Invalid index: the given key does not identify an element in this collection value.');
      return traverse(attrs, rest.slice(1), root);
    },
  };
  return scope;
}

function lookupFromState(resources: TfResource[], cfg: Config): Lookup {
  return (blockKey) => {
    const block = cfg.resources.find((r) => r.key === blockKey);
    if (!block) return undefined;
    const matches = resources.filter((r) => r.type === block.type && r.name === block.name);
    if (!matches.length && block.mode === 'single') return undefined;
    return { mode: block.mode, byKey: new Map(matches.map((r) => [String(r.key ?? ''), r.attrs])) };
  };
}

function evalAttrs(block: RBlock, scope: Scope): Record<string, unknown> {
  const attrs: Record<string, unknown> = {};
  for (const [k, e] of Object.entries(block.attrs)) if (!META_ATTRS.includes(k)) attrs[k] = evaluate(e, scope);
  for (const nb of block.blocks) {
    const item: Record<string, unknown> = {};
    for (const [k, e] of Object.entries(nb.attrs)) item[k] = evaluate(e, scope);
    for (const sub of nb.blocks) { const list = (item[sub.type] as unknown[] | undefined) ?? []; list.push(Object.fromEntries(Object.entries(sub.attrs).map(([k, e]) => [k, evaluate(e, scope)]))); item[sub.type] = list; }
    attrs[nb.type] = [...((attrs[nb.type] as unknown[] | undefined) ?? []), item];
  }
  for (const [k, d] of Object.entries(block.schema.optional)) if (!(k in attrs)) attrs[k] = clone(d);
  return attrs;
}

const blank = (v: unknown) => (v === undefined || (Array.isArray(v) && v.length === 0) ? null : v);
const same = (a: unknown, b: unknown) => stableStringify(blank(a)) === stableStringify(blank(b));

function instanceKeys(block: RBlock, scope: Scope): { key: string; raw: string | number | undefined; each?: { key: string; value: unknown }; count?: number }[] {
  if (block.mode === 'count') {
    const n = evaluate(block.attrs.count!, scope);
    if (isUnknown(n)) throw new EvalError('Invalid count argument: The "count" value depends on resource attributes that cannot be determined until apply.');
    return Array.from({ length: Number(n) }, (_, i) => ({ key: String(i), raw: i, count: i }));
  }
  if (block.mode === 'each') {
    const v = evaluate(block.attrs.for_each!, scope);
    if (isUnknown(v) || (Array.isArray(v) && hasUnknown(v))) throw new EvalError('Invalid for_each argument: The "for_each" set includes values derived from resource attributes that cannot be determined until apply.');
    if (Array.isArray(v)) return [...new Set(v.map(String))].sort().map((k) => ({ key: k, raw: k, each: { key: k, value: k } }));
    return Object.keys(v as object).sort().map((k) => ({ key: k, raw: k, each: { key: k, value: (v as Record<string, unknown>)[k] } }));
  }
  return [{ key: '', raw: undefined }];
}

const addressOf = (block: { type: string; name: string }, raw: string | number | undefined) => block.type + '.' + block.name + (raw === undefined ? '' : typeof raw === 'number' ? `[${raw}]` : '["' + raw + '"]');

// ─── Planning ───────────────────────────────────────────────────────────────

interface PlanItem {
  address: string; type: string; name: string; raw: string | number | undefined; block?: RBlock; eachScope?: { key: string; value: unknown }; countScope?: number;
  action: 'create' | 'update' | 'delete' | 'replace'; before?: Record<string, unknown>; after?: Record<string, unknown>;
  changed: string[]; forceNew: string[]; reason: string; deps: string[]; schema: ResourceSchema;
}
interface OutChange { name: string; before: unknown; after: unknown; sensitive: boolean; action: 'create' | 'update' | 'delete' }
interface Plan { cfg: Config; vars: Record<string, unknown>; items: PlanItem[]; outputs: OutChange[]; working: TfResource[]; notes: string[]; fingerprint: string; destroyMode: boolean }
interface PlanOptions { destroy?: boolean; replace?: string[]; vars?: Record<string, string>; varFiles?: string[]; refresh?: boolean }

function fingerprint(st: TfState): string {
  const text = Object.keys(st.files).filter((f) => f !== STATE_FILE).sort().map((f) => `${f}${st.files[f]}`).join('\u0000');
  let h = 0x811c9dc5;
  for (const ch of text) h = Math.imul(h ^ ch.charCodeAt(0), 0x01000193) >>> 0;
  return h.toString(16);
}

const COMPUTED_ATTRS = (schema: ResourceSchema) => Object.keys(schema.computed);

function topoOrder(cfg: Config): RBlock[] | string {
  const out: RBlock[] = [];
  const state = new Map<string, 1 | 2>();
  let cycle = '';
  const visit = (b: RBlock, trail: string[]) => {
    if (cycle || state.get(b.key) === 2) return;
    if (state.get(b.key) === 1) { cycle = [...trail.slice(trail.indexOf(b.key)), b.key].join(', '); return; }
    state.set(b.key, 1);
    for (const d of b.deps) visit(cfg.resources.find((r) => r.key === d)!, [...trail, b.key]);
    state.set(b.key, 2);
    out.push(b);
  };
  for (const b of cfg.resources) visit(b, []);
  return cycle ? cycle : out;
}

function makePlan(st: TfState, opts: PlanOptions): { plan: Plan } | { errors: string[] } {
  const loaded = loadConfig(st);
  if ('errors' in loaded) return loaded;
  const { cfg } = loaded;
  const resolved = resolveVariables(st, cfg, opts.vars ?? {}, opts.varFiles ?? []);
  if (resolved.errors.length) return { errors: resolved.errors };
  const { vars } = resolved;
  const order = topoOrder(cfg);
  if (typeof order === 'string') return { errors: [diag(st, 'Error', 'Cycle: ' + order)] };

  const working = clone(st.resources);
  const notes: string[] = [];
  if (opts.refresh !== false) {
    for (const [address, changes] of Object.entries(st.cloud)) {
      const res = working.find((r) => r.address === address);
      if (!res) continue;
      const before = clone(res.attrs);
      for (const [path, value] of Object.entries(changes)) setPath(res.attrs, path, value);
      notes.push('  # ' + address + ' has changed\n  ~ resource "' + res.type + '" "' + res.name + '" {\n' + diffLines(before, res.attrs, SCHEMAS[res.type]!, 'update', [], 6).join('\n') + '\n    }');
    }
  }

  const items: PlanItem[] = [];
  const planned = new Map<string, Inst>();
  const wanted = new Set<string>();
  try {
    if (opts.destroy) {
      for (const r of working) items.push({ address: r.address, type: r.type, name: r.name, raw: r.key, action: 'delete', before: r.attrs, changed: [], forceNew: [], reason: '', deps: r.deps, schema: SCHEMAS[r.type]! });
    } else for (const block of order) {
      const inst: Inst = { mode: block.mode, byKey: new Map() };
      planned.set(block.key, inst);
      for (const k of instanceKeys(block, makeScope(cfg, vars, (key) => planned.get(key), undefined, undefined))) {
        const scope = makeScope(cfg, vars, (key) => planned.get(key), k.each, k.count);
        const address = addressOf(block, k.raw);
        wanted.add(address);
        const attrs = evalAttrs(block, scope);
        const existing = working.find((r) => r.address === address);
        const deps = block.deps.flatMap((d) => { const dep = cfg.resources.find((r) => r.key === d)!; return [...(planned.get(d)?.byKey.keys() ?? [])].map((key) => addressOf(dep, dep.mode === 'single' ? undefined : dep.mode === 'count' ? Number(key) : key)); });
        const base = { address, type: block.type, name: block.name, raw: k.raw, block, eachScope: k.each, countScope: k.count, deps, schema: block.schema };
        const computeNew = () => Object.fromEntries(COMPUTED_ATTRS(block.schema).map((c) => [c, block.schema.computed[c]!(attrs, null, cfg.region)]));
        if (!existing) {
          const after = { ...attrs, ...computeNew() };
          inst.byKey.set(k.key, after);
          items.push({ ...base, action: 'create', after, changed: [], forceNew: [], reason: '' });
          continue;
        }
        for (const ig of block.lifecycle.ignore) if (ig in existing.attrs) attrs[ig] = existing.attrs[ig];
        const computed = COMPUTED_ATTRS(block.schema);
        const changed = [...new Set([...Object.keys(attrs), ...Object.keys(existing.attrs)])].filter((a) => !computed.includes(a) && (!same(existing.attrs[a], attrs[a]) || hasUnknown(attrs[a])));
        const forceNew = changed.filter((a) => block.schema.forceNew.includes(a));
        const reason = existing.tainted ? 'tainted' : opts.replace?.includes(address) ? 'requested' : '';
        if (forceNew.length || reason) {
          const after = { ...attrs, ...computeNew() };
          inst.byKey.set(k.key, after);
          items.push({ ...base, action: 'replace', before: existing.attrs, after, changed, forceNew, reason });
        } else {
          const after = { ...attrs, ...Object.fromEntries(computed.map((c) => [c, existing.attrs[c]])) };
          inst.byKey.set(k.key, after);
          if (changed.length) items.push({ ...base, action: 'update', before: existing.attrs, after, changed, forceNew: [], reason: '' });
        }
      }
    }
    if (!opts.destroy) {
      for (const r of working) if (!wanted.has(r.address)) items.push({ address: r.address, type: r.type, name: r.name, raw: r.key, action: 'delete', before: r.attrs, changed: [], forceNew: [], reason: '', deps: r.deps, schema: SCHEMAS[r.type]! });
    }
    for (const item of items) {
      if ((item.action === 'delete' || item.action === 'replace') && working.length) {
        const block = cfg.resources.find((r) => r.type === item.type && r.name === item.name);
        if (block?.lifecycle.preventDestroy) return { errors: [diag(st, 'Error', 'Instance cannot be destroyed', 'Resource ' + item.address + ' has lifecycle.prevent_destroy set, but the plan calls for this resource to be destroyed. To avoid this error and continue with the plan, either disable lifecycle.prevent_destroy or reduce the scope of the plan using the -target option.', { file: block.file, line: block.line })] };
      }
    }
    const outputs: OutChange[] = [];
    const scope = makeScope(cfg, vars, (key) => planned.get(key));
    if (opts.destroy) for (const [name, o] of Object.entries(st.outputs)) outputs.push({ name, before: o.value, after: undefined, sensitive: o.sensitive, action: 'delete' });
    else {
      for (const o of cfg.outputs) {
        const after = evaluate(o.expr, scope);
        const prev = st.outputs[o.name];
        if (!prev) outputs.push({ name: o.name, before: undefined, after, sensitive: o.sensitive, action: 'create' });
        else if (!same(prev.value, after) || hasUnknown(after)) outputs.push({ name: o.name, before: prev.value, after, sensitive: o.sensitive, action: 'update' });
      }
      for (const [name, o] of Object.entries(st.outputs)) if (!cfg.outputs.some((x) => x.name === name)) outputs.push({ name, before: o.value, after: undefined, sensitive: o.sensitive, action: 'delete' });
    }
    return { plan: { cfg, vars, items, outputs, working, notes, fingerprint: fingerprint(st), destroyMode: Boolean(opts.destroy) } };
  } catch (e) {
    if (e instanceof EvalError) return { errors: [diag(st, 'Error', e.message.split(':')[0] ?? 'Error', e.message.includes(':') ? e.message.slice(e.message.indexOf(':') + 2) : '')] };
    throw e;
  }
}

function setPath(obj: Record<string, unknown>, path: string, value: unknown) {
  const parts = path.split('.');
  let cur = obj;
  for (const p of parts.slice(0, -1)) { if (typeof cur[p] !== 'object' || cur[p] === null) cur[p] = {}; cur = cur[p] as Record<string, unknown>; }
  cur[parts[parts.length - 1]!] = value;
}

// ─── Rendering ──────────────────────────────────────────────────────────────

function show(v: unknown): string {
  if (isUnknown(v)) return '(known after apply)';
  if (v === null || v === undefined) return 'null';
  if (typeof v === 'string') return JSON.stringify(v);
  if (Array.isArray(v)) return '[' + v.map(show).join(', ') + ']';
  if (typeof v === 'object') { const e = Object.entries(v as Record<string, unknown>); return e.length ? '{ ' + e.map(([k, x]) => JSON.stringify(k) + ' = ' + show(x)).join(', ') + ' }' : '{}'; }
  return typeof v === 'number' || typeof v === 'boolean' ? String(v) : JSON.stringify(v);
}
const isMap = (v: unknown): v is Record<string, unknown> => Boolean(v) && typeof v === 'object' && !Array.isArray(v) && !isUnknown(v);

function createLines(attrs: Record<string, unknown>, schema: ResourceSchema, sym: string, indent: number): string[] {
  const pad = ' '.repeat(indent);
  const keys = Object.keys(attrs).filter((k) => attrs[k] !== null && attrs[k] !== undefined).sort();
  const width = Math.max(0, ...keys.filter((k) => !schema.blocks.includes(k)).map((k) => k.length));
  const out: string[] = [];
  for (const k of keys) {
    const v = attrs[k];
    if (schema.blocks.includes(k) && Array.isArray(v)) {
      for (const item of v) out.push(pad + sym + ' ' + k + ' {', ...createLines(item as Record<string, unknown>, { ...schema, blocks: [] }, sym, indent + 4), pad + '  }');
    } else if (isMap(v) && Object.keys(v).length) {
      out.push(pad + sym + ' ' + k.padEnd(width) + ' = {', ...Object.entries(v).map(([mk, mv]) => pad + '    ' + sym + ' ' + JSON.stringify(mk) + ' = ' + show(mv)), pad + '  }');
    } else out.push(pad + sym + ' ' + k.padEnd(width) + ' = ' + show(v));
  }
  return out;
}

function diffLines(before: Record<string, unknown>, after: Record<string, unknown>, schema: ResourceSchema, action: string, forceNew: string[], indent: number): string[] {
  const pad = ' '.repeat(indent);
  const out: string[] = [];
  let hidden = 0;
  for (const k of [...new Set([...Object.keys(before), ...Object.keys(after)])].sort()) {
    const b = before[k];
    const a = after[k];
    if (same(b, a) && !hasUnknown(a)) { if (b !== null && b !== undefined) hidden++; continue; }
    const mark = action === 'replace' && forceNew.includes(k) ? '  # forces replacement' : '';
    if (schema.blocks.includes(k)) {
      const bl = (b as Record<string, unknown>[] | undefined) ?? [];
      const al = (a as Record<string, unknown>[] | undefined) ?? [];
      for (let i = 0; i < Math.max(bl.length, al.length); i++) {
        if (!bl[i]) out.push(pad + '+ ' + k + ' {', ...createLines(al[i]!, { ...schema, blocks: [] }, '+', indent + 4), pad + '  }');
        else if (!al[i]) out.push(pad + '- ' + k + ' {', ...createLines(bl[i]!, { ...schema, blocks: [] }, '-', indent + 4), pad + '  }');
        else if (!same(bl[i], al[i])) out.push(pad + '~ ' + k + ' {', ...diffLines(bl[i]!, al[i]!, { ...schema, blocks: [] }, 'update', [], indent + 4), pad + '  }');
      }
    } else if (isMap(b) && isMap(a)) {
      out.push(pad + '~ ' + k + ' = {');
      for (const mk of [...new Set([...Object.keys(b), ...Object.keys(a)])].sort()) {
        if (!(mk in a)) out.push(pad + '    - ' + JSON.stringify(mk) + ' = ' + show(b[mk]) + ' -> null');
        else if (!(mk in b)) out.push(pad + '    + ' + JSON.stringify(mk) + ' = ' + show(a[mk]));
        else if (!same(b[mk], a[mk])) out.push(pad + '    ~ ' + JSON.stringify(mk) + ' = ' + show(b[mk]) + ' -> ' + show(a[mk]));
      }
      out.push(pad + '  }');
    } else if ((b === null || b === undefined) && !(a === null || a === undefined)) out.push(pad + '+ ' + k + ' = ' + show(a));
    else if (a === null || a === undefined) out.push(pad + '- ' + k + ' = ' + show(b) + ' -> null');
    else out.push(pad + '~ ' + k + ' = ' + show(b) + ' -> ' + show(a) + mark);
  }
  if (hidden) out.push(`${pad}  # (${hidden} unchanged attribute${hidden === 1 ? '' : 's'} hidden)`);
  return out;
}

function summarise(plan: Plan) {
  const add = plan.items.filter((i) => i.action === 'create' || i.action === 'replace').length;
  const change = plan.items.filter((i) => i.action === 'update').length;
  const destroy = plan.items.filter((i) => i.action === 'delete' || i.action === 'replace').length;
  return { add, change, destroy };
}

function renderPlan(plan: Plan, savedAs?: string): string {
  const { add, change, destroy } = summarise(plan);
  let out = '';
  if (plan.notes.length) out += 'Note: Objects have changed outside of Terraform\n\nTerraform detected the following changes made outside of Terraform since the last "terraform apply" which may have affected this plan:\n\n' + plan.notes.join('\n\n') + '\n\nUnless you have made equivalent changes to your configuration, or ignored the relevant attributes using ignore_changes, the following plan may include actions to undo or respond to these changes.\n\n';
  if (!plan.items.length && !plan.outputs.length) return out + 'No changes. Your infrastructure matches the configuration.\n\nTerraform has compared your real infrastructure against your configuration and found no differences, so no changes are needed.\n';
  if (plan.items.length) {
    const sym: string[] = [];
    if (plan.items.some((i) => i.action === 'create')) sym.push('  + create');
    if (plan.items.some((i) => i.action === 'update')) sym.push('  ~ update in-place');
    if (plan.items.some((i) => i.action === 'delete')) sym.push('  - destroy');
    if (plan.items.some((i) => i.action === 'replace')) sym.push('-/+ destroy and then create replacement');
    out += 'Terraform used the selected providers to generate the following execution plan. Resource actions are indicated with the following symbols:\n' + sym.join('\n') + '\n\nTerraform will perform the following actions:\n\n';
    for (const item of plan.items) {
      const head = { create: '  # ' + item.address + ' will be created\n  + ', update: '  # ' + item.address + ' will be updated in-place\n  ~ ', delete: '  # ' + item.address + ' will be destroyed\n  - ', replace: '  # ' + item.address + (item.reason === 'tainted' ? ' is tainted, so must be replaced' : item.reason === 'requested' ? ' will be replaced, as requested' : ' must be replaced') + '\n-/+ ' }[item.action];
      out += head + 'resource "' + item.type + '" "' + item.name + '" {\n';
      const body = item.action === 'create' ? createLines(item.after!, item.schema, '+', 6) : item.action === 'delete' ? createLines(item.before!, item.schema, '-', 6).map((l) => (l.endsWith('{') || !l.includes(' = ') ? l : l + ' -> null')) : diffLines(item.before!, item.after!, item.schema, item.action, item.forceNew, 6);
      out += body.join('\n') + '\n    }\n\n';
    }
    out += `Plan: ${add} to add, ${change} to change, ${destroy} to destroy.\n`;
  }
  if (plan.outputs.length) {
    out += (plan.items.length ? '\n' : 'Terraform used the selected providers to generate the following execution plan. Resource actions are indicated with the following symbols:\n  ~ update in-place\n\nTerraform will perform the following actions:\n\n') + 'Changes to Outputs:\n';
    for (const o of plan.outputs) {
      const v = (x: unknown) => (o.sensitive ? '(sensitive value)' : show(x));
      out += '  ' + (o.action === 'create' ? '+ ' : o.action === 'delete' ? '- ' : '~ ') + o.name + ' = ' + (o.action === 'update' ? v(o.before) + ' -> ' + v(o.after) : o.action === 'delete' ? v(o.before) + ' -> null' : v(o.after)) + '\n';
    }
    if (!plan.items.length) out += '\nYou can apply this plan to save these new output values to the Terraform state, without changing any real infrastructure.\n';
  }
  if (savedAs) out += '\nSaved the plan to: ' + savedAs + '\n\nTo perform exactly these actions, run the following command to apply:\n    terraform apply "' + savedAs + '"\n';
  return out;
}

// ─── Apply ──────────────────────────────────────────────────────────────────

function randomId(st: TfState, seed: string): string {
  st.seq += 1;
  let h = 0x811c9dc5;
  let out = '';
  for (let round = 0; out.length < 17; round++) {
    for (const ch of `${seed}:${st.seq}:${round}`) h = Math.imul(h ^ ch.charCodeAt(0), 0x01000193) >>> 0;
    out += h.toString(16).padStart(8, '0');
  }
  return out.slice(0, 17);
}

function destroyOrder(resources: TfResource[]): TfResource[] {
  const out: TfResource[] = [];
  const seen = new Set<string>();
  const visit = (r: TfResource) => {
    if (seen.has(r.address)) return;
    seen.add(r.address);
    for (const other of resources) if (other.deps.includes(r.address)) visit(other);
    out.push(r);
  };
  resources.forEach(visit);
  return out;
}

const idOf = (r: { attrs: Record<string, unknown> }): string => (typeof r.attrs.id === 'string' ? r.attrs.id : '');

function applyDiag(st: TfState, problem: string, address: string, block: RBlock): string {
  return `Error: ${problem}\n\n  with ${address},\n  on ${block.file} line ${block.line}, in resource "${block.type}" "${block.name}":\n   ${block.line}: ${((st.files[block.file] ?? '').split('\n')[block.line - 1] ?? '').trim()}\n`;
}

function applyPlan(st: TfState, plan: Plan): { stdout: string; error: string } {
  const { cfg, vars } = plan;
  const working = plan.working;
  let out = '';
  let added = 0, changed = 0, destroyed = 0;
  const finish = (error: string) => {
    st.resources = working;
    st.serial += 1;
    st.cloud = {};
    mirror(st);
    return { stdout: out, error };
  };
  const remove = (item: PlanItem) => {
    const res = working.find((r) => r.address === item.address)!;
    out += item.address + ': Destroying... [id=' + idOf(res) + ']\n' + item.address + ': Destruction complete after 0s\n';
    working.splice(working.indexOf(res), 1);
    destroyed += 1;
  };
  const existingBuckets = st.resources.filter((r) => r.type === 'aws_s3_bucket').map((r) => String(r.attrs.bucket));
  const nonDeletes = plan.items.filter((i) => i.action !== 'delete');
  const deletes = destroyOrder(working.filter((r) => plan.items.some((i) => i.action === 'delete' && i.address === r.address)));
  for (const item of nonDeletes) {
    const block = item.block!;
    if (item.action === 'replace') {
      const stale = working.find((r) => r.address === item.address)!;
      out += item.address + ': Destroying... [id=' + idOf(stale) + ']\n' + item.address + ': Destruction complete after 0s\n';
      working.splice(working.indexOf(stale), 1);
      destroyed += 1;
    }
    const scope = makeScope(cfg, vars, lookupFromState(working, cfg), item.eachScope, item.countScope);
    let attrs: Record<string, unknown>;
    try { attrs = evalAttrs(block, scope); } catch (e) { return finish(diag(st, 'Error', (e as Error).message)); }
    const existing = working.find((r) => r.address === item.address);
    if (existing) {
      for (const ig of block.lifecycle.ignore) if (ig in existing.attrs) attrs[ig] = existing.attrs[ig];
      out += item.address + ': Modifying... [id=' + idOf(existing) + ']\n';
      const problem = applyError(item.type, attrs, existingBuckets);
      if (problem) return finish(applyDiag(st, problem, item.address, block));
      existing.attrs = { ...attrs, ...Object.fromEntries(COMPUTED_ATTRS(block.schema).map((c) => [c, existing.attrs[c]])) };
      existing.deps = item.deps;
      out += item.address + ': Modifications complete after 1s [id=' + idOf(existing) + ']\n';
      changed += 1;
      continue;
    }
    out += item.address + ': Creating...\n';
    const problem = applyError(item.type, attrs, existingBuckets);
    if (problem) return finish(applyDiag(st, problem, item.address, block));
    const rid = randomId(st, item.address);
    const computed = Object.fromEntries(COMPUTED_ATTRS(block.schema).map((c) => [c, block.schema.computed[c]!(attrs, rid, cfg.region)]));
    const created: TfResource = { address: item.address, type: item.type, name: item.name, attrs: { ...attrs, ...computed }, deps: item.deps };
    if (item.raw !== undefined) created.key = item.raw;
    working.push(created);
    out += item.address + ': Creation complete after 1s [id=' + idOf(created) + ']\n';
    added += 1;
  }
  for (const res of deletes) remove({ address: res.address } as PlanItem);
  // Outputs are re-evaluated against the final state.
  st.outputs = {};
  if (!plan.destroyMode) {
    const scope = makeScope(cfg, vars, lookupFromState(working, cfg));
    try { for (const o of cfg.outputs) st.outputs[o.name] = { value: evaluate(o.expr, scope), sensitive: o.sensitive }; } catch (e) { return finish(diag(st, 'Error', (e as Error).message)); }
  }
  out += '\n' + (plan.destroyMode ? `Destroy complete! Resources: ${destroyed} destroyed.\n` : `Apply complete! Resources: ${added} added, ${changed} changed, ${destroyed} destroyed.\n`);
  const shown = Object.entries(st.outputs);
  if (shown.length) out += '\nOutputs:\n\n' + shown.map(([k, o]) => k + ' = ' + (o.sensitive ? '<sensitive>' : show(o.value))).join('\n') + '\n';
  return finish('');
}

// ─── Commands ───────────────────────────────────────────────────────────────

function flags(args: string[]) {
  const vars: Record<string, string> = {};
  const varFiles: string[] = [];
  const replace: string[] = [];
  const positional: string[] = [];
  let out: string | undefined;
  const bool = new Set<string>();
  for (let i = 0; i < args.length; i++) {
    const a = args[i]!;
    const take = (name: string) => (a === name ? args[++i] ?? '' : a.slice(name.length + 1));
    if (a === '-var' || a.startsWith('-var=')) { const [k, ...v] = take('-var').split('='); vars[k!] = v.join('='); }
    else if (a === '-var-file' || a.startsWith('-var-file=')) varFiles.push(take('-var-file'));
    else if (a.startsWith('-replace=')) replace.push(a.slice(9));
    else if (a.startsWith('-out=')) out = a.slice(5);
    else if (a.startsWith('-')) bool.add(a.replace(/^-+/, '').split('=')[0]!);
    else positional.push(a);
  }
  return { vars, varFiles, replace, out, bool, positional, refreshOff: args.includes('-refresh=false') };
}

const HELP = 'Usage: terraform <command> [options]\n\nCommands:\n  init       Prepare the working directory\n  validate   Check the configuration is valid\n  plan       Show the changes Terraform would make   (-out=FILE, -var, -destroy, -replace=ADDR)\n  apply      Create or update infrastructure          (-auto-approve, FILE, -replace=ADDR)\n  destroy    Destroy all managed infrastructure       (-auto-approve)\n  output     Show output values                       (-json, -raw, NAME)\n  state      list | show ADDR | rm ADDR\n  taint / untaint ADDR\n  import ADDR ID\n  show\n  version\n\nSimulator helpers:\n  aws-console edit ADDR attr=value   pretend someone changed a resource by hand\n  cat FILE, ls\n';

export function runTerraformCommand(prev: TfState, line: string): TfResult {
  const st = clone(prev);
  st.history.push(line.trim());
  let stdout = '';
  let stderr = '';
  let code = 0;
  const tokens = tokenize(line);
  const [cmd = '', sub = '', ...rest] = tokens;
  const fail = (text: string, exit = 1) => { stderr += text; code = exit; };

  if (cmd === 'cat') {
    const file = tokens[1] ?? '';
    if (file in st.files) stdout = st.files[file]!.endsWith('\n') ? st.files[file]! : st.files[file]! + '\n'; else fail('cat: ' + file + ': No such file or directory\n');
  } else if (cmd === 'ls') stdout = Object.keys(st.files).sort().join('\n') + '\n';
  else if (cmd === 'help') stdout = HELP;
  else if (cmd === 'aws-console') {
    const [, addr = '', assignment = ''] = tokens.slice(1);
    const eq = assignment.indexOf('=');
    const res = st.resources.find((r) => r.address === addr);
    if (tokens[1] !== 'edit' || !res || eq < 1) fail('usage: aws-console edit <resource address> <attribute>=<json value>\n');
    else {
      let value: unknown = assignment.slice(eq + 1);
      try { value = JSON.parse(value as string); } catch { /* keep as string */ }
      (st.cloud[addr] ??= {})[assignment.slice(0, eq)] = value;
      stdout = 'Console edit recorded for ' + addr + '. Terraform will notice on the next plan.\n';
    }
  } else if (cmd !== 'terraform') fail('bash: ' + cmd + ': command not found. This terminal supports terraform, aws-console, cat and ls.\n', 127);
  else if (!sub || sub === '-help' || sub === '--help' || sub === 'help') stdout = HELP;
  else {
    const f = flags(rest);
    const needsInit = () => {
      if (st.initialized) return false;
      fail(diag(st, 'Error', 'Required plugins are not installed', 'The installed provider plugins are not consistent with the packages selected in the dependency lock file. Terraform uses external plugins to provide support for the cloud APIs. Run "terraform init" to install them.'));
      return true;
    };
    switch (sub) {
      case 'version': stdout = 'Terraform v1.8.5\non linux_amd64\n+ provider registry.terraform.io/hashicorp/aws v5.31.0\n'; break;
      case 'init': {
        const loaded = loadConfig(st);
        if ('errors' in loaded) { fail(loaded.errors.join('\n')); break; }
        st.initialized = true;
        stdout = 'Initializing the backend...\n\nInitializing provider plugins...\n- Finding hashicorp/aws versions matching "~> 5.0"...\n- Installing hashicorp/aws v5.31.0...\n- Installed hashicorp/aws v5.31.0 (signed by HashiCorp)\n\nTerraform has created a lock file .terraform.lock.hcl to record the provider selections it made above.\n\nTerraform has been successfully initialized!\n\nYou may now begin working with Terraform. Try running "terraform plan" to see any changes that are required for your infrastructure.\n';
        break;
      }
      case 'validate': {
        const loaded = loadConfig(st);
        if ('errors' in loaded) fail(loaded.errors.join('\n')); else stdout = 'Success! The configuration is valid.\n\n';
        break;
      }
      case 'plan': case 'apply': case 'destroy': {
        if (needsInit()) break;
        const savedPlan = sub === 'apply' ? f.positional[0] : undefined;
        const made = makePlan(st, { destroy: sub === 'destroy' || f.bool.has('destroy'), replace: f.replace, vars: f.vars, varFiles: f.varFiles, refresh: !f.refreshOff });
        if ('errors' in made) { fail(made.errors.join('\n')); break; }
        const { plan } = made;
        const warnings = plan.cfg.warnings.join('\n');
        if (warnings) stdout += warnings + '\n';
        if (sub === 'plan') {
          if (f.out) st.savedPlans[f.out] = plan.fingerprint;
          stdout += renderPlan(plan, f.out);
          break;
        }
        if (savedPlan) {
          if (st.savedPlans[savedPlan] === undefined) { fail(diag(st, 'Error', 'Failed to load "' + savedPlan + '" as a plan file', 'Error: stat ' + savedPlan + ': no such file or directory')); break; }
          if (st.savedPlans[savedPlan] !== plan.fingerprint) { fail(diag(st, 'Error', 'Saved plan is stale', 'The given plan file can no longer be applied because the configuration has changed since it was created. Create a new plan with "terraform plan -out=' + savedPlan + '".')); break; }
        } else if (!plan.items.length && !plan.outputs.length) { stdout += renderPlan(plan); break; }
        else if (!f.bool.has('auto-approve')) {
          stdout += renderPlan(plan);
          fail('\nDo you really want to ' + (sub === 'destroy' ? 'destroy all resources' : 'perform these actions') + '?\n  Terraform will wait for your response. This terminal cannot answer prompts, so add -auto-approve to continue.\n\nApply cancelled.\n');
          break;
        } else stdout += renderPlan(plan) + '\n';
        const result = applyPlan(st, plan);
        stdout += result.stdout;
        if (result.error) fail(result.error + '\n');
        break;
      }
      case 'output': {
        const keys = Object.keys(st.outputs).sort();
        if (!keys.length) { stdout = 'Warning: No outputs found\n\nThe state file either has no outputs defined, or all the defined outputs are empty. Please define an output in your configuration with the `output` keyword and run `terraform refresh` for it to become available.\n'; break; }
        const name = f.positional[0];
        if (name && !(name in st.outputs)) { fail(diag(st, 'Error', 'Output "' + name + '" not found', 'The output variable requested could not be found in the state file. If you recently added this to your configuration, be sure to run `terraform apply`, since the state won\'t be updated with new output variables until that command is run.')); break; }
        const pick = name ? [name] : keys;
        if (f.bool.has('json')) stdout = JSON.stringify(name ? st.outputs[name]!.value : Object.fromEntries(pick.map((k) => [k, { value: st.outputs[k]!.value, sensitive: st.outputs[k]!.sensitive }])), null, 2) + '\n';
        else if (f.bool.has('raw') && name) stdout = String(st.outputs[name]!.value) + '\n';
        else stdout = pick.map((k) => (name ? '' : k + ' = ') + (st.outputs[k]!.sensitive && !name ? '<sensitive>' : show(st.outputs[k]!.value))).join('\n') + '\n';
        break;
      }
      case 'state': {
        const action = rest[0] ?? '';
        const targets = rest.slice(1);
        if (action === 'list') stdout = st.resources.map((r) => r.address).sort().join('\n') + (st.resources.length ? '\n' : '');
        else if (action === 'show') {
          const r = st.resources.find((x) => x.address === targets[0]);
          if (!r) fail('No instance found for the given address!\n\nThis command requires that the address references one specific instance of a resource.\n');
          else stdout = '# ' + r.address + ':\nresource "' + r.type + '" "' + r.name + '" {\n' + createLines(r.attrs, SCHEMAS[r.type]!, ' ', 0).join('\n') + '\n}\n';
        } else if (action === 'rm') {
          const missing = targets.find((t) => !st.resources.some((r) => r.address === t));
          if (!targets.length || missing) fail('Invalid target address' + (missing ? ' "' + missing + '"' : '') + ': no matching objects found in state.\n');
          else { st.resources = st.resources.filter((r) => !targets.includes(r.address)); st.serial += 1; mirror(st); stdout = `${targets.map((t) => 'Removed ' + t).join('\n')}\nSuccessfully removed ${targets.length} resource instance(s).\n`; }
        } else fail('Usage: terraform state <list|show|rm> [address]\n');
        break;
      }
      case 'taint': case 'untaint': {
        const r = st.resources.find((x) => x.address === rest[0]);
        if (!r) fail('Error: No such resource instance\n\nThe resource instance ' + (rest[0] ?? '') + ' was not found in the state.\n');
        else { r.tainted = sub === 'taint' ? true : undefined; mirror(st); stdout = 'Resource instance ' + r.address + ' has been marked as ' + (sub === 'taint' ? 'tainted' : 'untainted') + '.\n'; }
        break;
      }
      case 'import': {
        const [address = '', id = ''] = rest;
        const loaded = loadConfig(st);
        if ('errors' in loaded) { fail(loaded.errors.join('\n')); break; }
        const block = loaded.cfg.resources.find((r) => address.startsWith(r.key));
        if (block?.mode !== 'single' || address !== block.key) { fail(diag(st, 'Error', 'Resource address "' + address + '" does not exist in the configuration', 'Before importing this resource, please create its configuration in the root module.')); break; }
        if (st.resources.some((r) => r.address === address)) { fail(diag(st, 'Error', 'Resource already managed by Terraform', 'Terraform is already managing a remote object for ' + address + '.')); break; }
        const resolved = resolveVariables(st, loaded.cfg, f.vars, f.varFiles);
        let attrs: Record<string, unknown>;
        try { attrs = evalAttrs(block, makeScope(loaded.cfg, resolved.vars, lookupFromState(st.resources, loaded.cfg))); } catch (e) { fail(diag(st, 'Error', (e as Error).message)); break; }
        const computed = Object.fromEntries(COMPUTED_ATTRS(block.schema).map((c) => [c, block.schema.computed[c]!(attrs, id.replace(/^[a-z]+-0?/, ''), loaded.cfg.region)]));
        st.resources.push({ address, type: block.type, name: block.name, attrs: { ...attrs, ...computed, id }, deps: [] });
        st.serial += 1; mirror(st);
        stdout = address + ': Importing from ID "' + id + '"...\n' + address + ': Import prepared!\n\nImport successful!\n\nThe resources that were imported are shown above. These resources are now in your Terraform state and will henceforth be managed by Terraform.\n';
        break;
      }
      case 'show': stdout = st.resources.length ? st.resources.map((r) => '# ' + r.address + ':\nresource "' + r.type + '" "' + r.name + '" {\n' + createLines(r.attrs, SCHEMAS[r.type]!, ' ', 0).join('\n') + '\n}\n').join('\n') : 'The state file is empty. No resources are represented.\n'; break;
      default: fail('Terraform has no command named "' + sub + '".\n\nTo see all of Terraform\'s top-level commands, run:\n  terraform -help\n');
    }
  }
  st.stdout = stdout;
  st.stderr = stderr;
  st.lastError = stderr;
  return { state: st, stdout, stderr, exitCode: code };
}

/** Plan against the current state without changing it. Used by the grader. */
export function planStatus(state: TfState): { clean: boolean; summary: string } {
  const made = makePlan(clone(state), {});
  if ('errors' in made) return { clean: false, summary: made.errors.join('\n') };
  const { add, change, destroy } = summarise(made.plan);
  const clean = !made.plan.items.length && !made.plan.outputs.length;
  return { clean, summary: clean ? 'No changes' : `Plan: ${add} to add, ${change} to change, ${destroy} to destroy` };
}

export { show as showValue };
