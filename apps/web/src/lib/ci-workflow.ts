import yaml from 'js-yaml';
import { ExpressionError, findExpressions, validateExpression } from './ci-expressions';

/** Parsing and validation for `.github/workflows/*.yml` files. */

export interface WorkflowStep {
  name?: string;
  id?: string;
  uses?: string;
  run?: string;
  with: Record<string, string>;
  env: Record<string, string>;
  if?: string;
  continueOnError: boolean;
}

export interface WorkflowEnvironment { name: string; url?: string }

export interface WorkflowJob {
  key: string;
  name?: string;
  runsOn: string;
  needs: string[];
  if?: string;
  env: Record<string, string>;
  environment?: WorkflowEnvironment;
  matrix: Record<string, string[]> | null;
  include: Record<string, string>[];
  exclude: Record<string, string>[];
  steps: WorkflowStep[];
  outputs: Record<string, string>;
}

export interface PushFilter { branches?: string[]; branchesIgnore?: string[]; tags?: string[]; tagsIgnore?: string[]; paths?: string[]; pathsIgnore?: string[] }
export interface PullRequestFilter { branches?: string[]; branchesIgnore?: string[]; paths?: string[]; pathsIgnore?: string[]; types?: string[] }
export interface DispatchInput { description?: string; required: boolean; default?: string; type: string; options: string[] }

export interface WorkflowTriggers {
  push?: PushFilter;
  pull_request?: PullRequestFilter;
  workflow_dispatch?: { inputs: Record<string, DispatchInput> };
  release?: { types: string[] };
  schedule?: string[];
}

export interface Workflow {
  file: string;
  name: string;
  triggers: WorkflowTriggers;
  env: Record<string, string>;
  jobs: WorkflowJob[];
}

export interface WorkflowIssue { file: string; line: number; col: number; message: string; yamlSyntax?: boolean }

export interface ParsedWorkflow { workflow: Workflow | null; errors: WorkflowIssue[] }

const TOP_KEYS = ['name', 'run-name', 'on', 'env', 'jobs', 'permissions', 'concurrency', 'defaults'];
const EVENTS = ['push', 'pull_request', 'pull_request_target', 'workflow_dispatch', 'release', 'schedule', 'workflow_call', 'workflow_run', 'merge_group', 'issues', 'issue_comment'];
const JOB_KEYS = ['name', 'runs-on', 'needs', 'if', 'env', 'environment', 'strategy', 'steps', 'outputs', 'permissions', 'timeout-minutes', 'concurrency', 'container', 'services', 'defaults', 'continue-on-error'];
const STEP_KEYS = ['name', 'id', 'uses', 'run', 'with', 'env', 'if', 'shell', 'working-directory', 'continue-on-error', 'timeout-minutes'];
const FILTER_KEYS = ['branches', 'branches-ignore', 'tags', 'tags-ignore', 'paths', 'paths-ignore', 'types'];

export function isWorkflowPath(path: string): boolean {
  return /^\.github\/workflows\/[^/]+\.ya?ml$/.test(path);
}

export function formatIssue(issue: WorkflowIssue): string {
  if (issue.yamlSyntax) return `Invalid workflow file: ${issue.file}#L${issue.line}\nYou have an error in your yaml syntax on line ${issue.line}`;
  return `Invalid workflow file: ${issue.file}#L${issue.line}\nThe workflow is not valid. ${issue.file} (Line: ${issue.line}, Col: ${issue.col}): ${issue.message}`;
}

/** Finds the line/column of a YAML key path such as ['jobs', 'test', 'steps']. */
function locate(source: string, path: string[]): { line: number; col: number } {
  const lines = source.split(/\r?\n/);
  let start = 0;
  let found = { line: 1, col: 1 };
  for (const key of path) {
    const pattern = new RegExp('^(\\s*)(- )?(["\']?)' + key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\3\\s*:');
    let matched = false;
    for (let i = start; i < lines.length; i++) {
      const match = pattern.exec(lines[i]!);
      if (match) {
        found = { line: i + 1, col: match[1]!.length + (match[2] ? 3 : 1) };
        start = i + 1;
        matched = true;
        break;
      }
    }
    if (!matched) break;
  }
  return found;
}

function locateText(source: string, text: string): { line: number; col: number } {
  const lines = source.split(/\r?\n/);
  for (let i = 0; i < lines.length; i++) {
    const col = lines[i]!.indexOf(text);
    if (col >= 0) return { line: i + 1, col: col + 1 };
  }
  return { line: 1, col: 1 };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** YAML scalars become strings exactly as GitHub would see them (3.10 is the number 3.1!). */
export function scalar(value: unknown): string {
  if (value === null || value === undefined) return '';
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  return JSON.stringify(value);
}

function stringList(value: unknown): string[] | undefined {
  if (value === undefined || value === null) return undefined;
  if (Array.isArray(value)) return value.map(scalar);
  return [scalar(value)];
}

function stringMap(value: unknown): Record<string, string> {
  if (!isRecord(value)) return {};
  return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, scalar(item)]));
}

export function parseWorkflow(file: string, source: string): ParsedWorkflow {
  const errors: WorkflowIssue[] = [];
  const issue = (path: string[], message: string) => { errors.push({ file, ...locate(source, path), message }); };
  let document: unknown;
  try {
    document = yaml.load(source);
  } catch (error) {
    const line = error instanceof yaml.YAMLException ? error.mark.line + 1 : 1;
    return { workflow: null, errors: [{ file, line, col: 1, message: 'yaml syntax', yamlSyntax: true }] };
  }
  if (!isRecord(document)) {
    return { workflow: null, errors: [{ file, line: 1, col: 1, message: 'No event triggers defined in `on`' }] };
  }
  for (const key of Object.keys(document)) if (!TOP_KEYS.includes(key)) issue([key], `Unexpected value '${key}'`);
  if (document.on === undefined) {
    // js-yaml keeps `on` as a string key; `true` appears only with YAML 1.1 parsers.
    errors.push({ file, line: 1, col: 1, message: 'No event triggers defined in `on`' });
  }
  const triggers = parseTriggers(document.on, issue);
  const env = stringMap(document.env);
  const jobs: WorkflowJob[] = [];
  if (document.jobs === undefined) errors.push({ file, line: 1, col: 1, message: 'Required property is missing: jobs' });
  else if (!isRecord(document.jobs)) issue(['jobs'], 'A mapping was not expected');
  else {
    for (const [key, raw] of Object.entries(document.jobs)) {
      if (!/^[A-Za-z_][A-Za-z0-9_-]*$/.test(key)) issue(['jobs', key], `The identifier '${key}' is invalid. IDs may only contain alphanumeric characters, '_', and '-'. IDs must start with a letter or '_' and and must be less than 100 characters.`);
      if (!isRecord(raw)) { issue(['jobs', key], `Job '${key}' must be a mapping`); continue; }
      const job = parseJob(key, raw, (path, message) => issue(['jobs', key, ...path], message));
      if (job) jobs.push(job);
    }
    if (Object.keys(document.jobs).length === 0) issue(['jobs'], 'Required property is missing: jobs');
    const keys = new Set(jobs.map((job) => job.key));
    for (const job of jobs) {
      for (const need of job.needs) {
        if (!keys.has(need)) issue(['jobs', job.key, 'needs'], `Job '${job.key}' depends on unknown job '${need}'.`);
      }
    }
    const cycle = findCycle(jobs);
    if (cycle) issue(['jobs', cycle, 'needs'], `The workflow must contain at least one job with no dependencies.`);
  }
  for (const expression of findExpressions(source)) {
    try {
      validateExpression(expression);
    } catch (error) {
      if (error instanceof ExpressionError) errors.push({ file, ...locateText(source, expression), message: error.message });
    }
  }
  for (const job of jobs) {
    for (const condition of [job.if, ...job.steps.map((step) => step.if)]) {
      if (!condition || condition.includes('${{')) continue;
      try {
        validateExpression(condition);
      } catch (error) {
        if (error instanceof ExpressionError) errors.push({ file, ...locateText(source, condition), message: error.message });
      }
    }
  }
  if (errors.length) return { workflow: null, errors: dedupe(errors) };
  const name = typeof document.name === 'string' ? document.name : file.replace(/^\.github\/workflows\//, '');
  return { workflow: { file, name, triggers, env, jobs }, errors: [] };
}

function dedupe(errors: WorkflowIssue[]): WorkflowIssue[] {
  const seen = new Set<string>();
  return errors.filter((item) => { const key = `${item.line}:${item.message}`; if (seen.has(key)) return false; seen.add(key); return true; });
}

function parseTriggers(on: unknown, issue: (path: string[], message: string) => void): WorkflowTriggers {
  const triggers: WorkflowTriggers = {};
  const events: [string, unknown][] = typeof on === 'string' ? [[on, null]]
    : Array.isArray(on) ? on.map((item) => [scalar(item), null])
      : isRecord(on) ? Object.entries(on) : [];
  if (on !== undefined && events.length === 0) issue(['on'], 'No event triggers defined in `on`');
  for (const [event, config] of events) {
    if (!EVENTS.includes(event)) { issue(['on', event], `Unexpected value '${event}'`); continue; }
    if (config !== null && config !== undefined && !isRecord(config) && event !== 'schedule') { issue(['on', event], `Unexpected value '${scalar(config)}'`); continue; }
    const filter = isRecord(config) ? config : {};
    if (event === 'push' || event === 'pull_request' || event === 'pull_request_target') {
      for (const key of Object.keys(filter)) if (!FILTER_KEYS.includes(key)) issue(['on', event, key], `Unexpected value '${key}'`);
      if (filter.branches !== undefined && filter['branches-ignore'] !== undefined) issue(['on', event], "Input contains both 'branches' and 'branches-ignore'. Only one of them is allowed.");
      const parsed: PushFilter & PullRequestFilter = {
        branches: stringList(filter.branches), branchesIgnore: stringList(filter['branches-ignore']),
        paths: stringList(filter.paths), pathsIgnore: stringList(filter['paths-ignore']),
      };
      if (event === 'push') {
        parsed.tags = stringList(filter.tags);
        parsed.tagsIgnore = stringList(filter['tags-ignore']);
        triggers.push = parsed;
      } else {
        parsed.types = stringList(filter.types);
        triggers.pull_request = parsed;
      }
    } else if (event === 'workflow_dispatch') {
      const inputs: Record<string, DispatchInput> = {};
      if (isRecord(filter.inputs)) {
        for (const [name, raw] of Object.entries(filter.inputs)) {
          const input = isRecord(raw) ? raw : {};
          inputs[name] = {
            description: typeof input.description === 'string' ? input.description : undefined,
            required: input.required === true,
            default: input.default === undefined ? undefined : scalar(input.default),
            type: typeof input.type === 'string' ? input.type : 'string',
            options: Array.isArray(input.options) ? input.options.map(scalar) : [],
          };
        }
      }
      triggers.workflow_dispatch = { inputs };
    } else if (event === 'release') {
      triggers.release = { types: stringList(filter.types) ?? ['published'] };
    } else if (event === 'schedule') {
      triggers.schedule = Array.isArray(config) ? config.map((item) => isRecord(item) ? scalar(item.cron) : '') : [];
    }
  }
  return triggers;
}

function parseJob(key: string, raw: Record<string, unknown>, issue: (path: string[], message: string) => void): WorkflowJob | null {
  for (const field of Object.keys(raw)) if (!JOB_KEYS.includes(field)) issue([field], `Unexpected value '${field}'`);
  if (raw['runs-on'] === undefined) issue([], 'Required property is missing: runs-on');
  const runsOn = Array.isArray(raw['runs-on']) ? raw['runs-on'].map(scalar).join(',') : scalar(raw['runs-on']);
  const needs = raw.needs === undefined ? [] : stringList(raw.needs) ?? [];
  let environment: WorkflowEnvironment | undefined;
  if (typeof raw.environment === 'string') environment = { name: raw.environment };
  else if (isRecord(raw.environment)) {
    if (typeof raw.environment.name !== 'string') issue(['environment'], 'Required property is missing: name');
    else environment = { name: raw.environment.name, url: typeof raw.environment.url === 'string' ? raw.environment.url : undefined };
  }
  let matrix: Record<string, string[]> | null = null;
  let include: Record<string, string>[] = [];
  let exclude: Record<string, string>[] = [];
  if (raw.strategy !== undefined) {
    if (!isRecord(raw.strategy)) issue(['strategy'], 'A mapping was expected');
    else if (raw.strategy.matrix !== undefined) {
      if (!isRecord(raw.strategy.matrix)) issue(['strategy', 'matrix'], 'A mapping was expected');
      else {
        matrix = {};
        for (const [name, values] of Object.entries(raw.strategy.matrix)) {
          if (name === 'include' || name === 'exclude') {
            const list = Array.isArray(values) ? values.filter(isRecord).map(stringMap) : [];
            if (name === 'include') include = list; else exclude = list;
          } else if (!Array.isArray(values)) issue(['strategy', 'matrix', name], `Matrix vector '${name}' does not contain any values`);
          else if (values.length === 0) issue(['strategy', 'matrix', name], `Matrix vector '${name}' does not contain any values`);
          else matrix[name] = values.map(scalar);
        }
      }
    }
  }
  const steps: WorkflowStep[] = [];
  if (raw.steps === undefined) issue([], 'Required property is missing: steps');
  else if (!Array.isArray(raw.steps)) issue(['steps'], 'A sequence was expected');
  else {
    raw.steps.forEach((item, index) => {
      if (!isRecord(item)) { issue(['steps'], `Step ${index + 1} must be a mapping`); return; }
      const anchor = Object.keys(item)[0] ?? 'steps';
      for (const field of Object.keys(item)) if (!STEP_KEYS.includes(field)) issue(['steps', field], `Unexpected value '${field}'`);
      if (item.uses !== undefined && item.run !== undefined) issue(['steps', anchor], "Step contains both 'uses' and 'run'. Each step needs exactly one of them.");
      if (item.uses === undefined && item.run === undefined) issue(['steps', anchor], 'Required property is missing: uses or run');
      if (typeof item.uses === 'string' && !item.uses.startsWith('./') && !item.uses.startsWith('docker://') && !/^[^/@\s]+\/[^@\s]+@[^@\s]+$/.test(item.uses)) {
        issue(['steps', 'uses'], `Expected format {org}/{repo}[/path]@ref. Actual '${item.uses}'`);
      }
      steps.push({
        name: item.name === undefined ? undefined : scalar(item.name),
        id: item.id === undefined ? undefined : scalar(item.id),
        uses: typeof item.uses === 'string' ? item.uses : undefined,
        run: item.run === undefined ? undefined : scalar(item.run),
        with: stringMap(item.with),
        env: stringMap(item.env),
        if: item.if === undefined ? undefined : scalar(item.if),
        continueOnError: item['continue-on-error'] === true,
      });
    });
  }
  return {
    key,
    name: raw.name === undefined ? undefined : scalar(raw.name),
    runsOn, needs,
    if: raw.if === undefined ? undefined : scalar(raw.if),
    env: stringMap(raw.env),
    environment, matrix, include, exclude, steps,
    outputs: stringMap(raw.outputs),
  };
}

function findCycle(jobs: WorkflowJob[]): string | null {
  const byKey = new Map(jobs.map((job) => [job.key, job]));
  const state = new Map<string, 'visiting' | 'done'>();
  let cycle: string | null = null;
  const visit = (key: string) => {
    if (cycle || state.get(key) === 'done') return;
    if (state.get(key) === 'visiting') { cycle = key; return; }
    state.set(key, 'visiting');
    for (const need of byKey.get(key)?.needs ?? []) if (byKey.has(need)) visit(need);
    state.set(key, 'done');
  };
  for (const job of jobs) visit(job.key);
  return cycle;
}

/** Expand a job's matrix into its combinations (cartesian product, minus exclude, plus include). */
export function expandMatrix(job: WorkflowJob): Record<string, string>[] {
  if (!job.matrix) return job.include.length ? job.include : [];
  let combos: Record<string, string>[] = [{}];
  for (const [name, values] of Object.entries(job.matrix)) {
    combos = combos.flatMap((combo) => values.map((value) => ({ ...combo, [name]: value })));
  }
  combos = combos.filter((combo) => !job.exclude.some((rule) => Object.entries(rule).every(([key, value]) => combo[key] === value)));
  for (const extra of job.include) {
    const matches = combos.filter((combo) => Object.entries(extra).every(([key, value]) => !(key in job.matrix!) || combo[key] === value));
    if (matches.length && Object.keys(extra).some((key) => !(key in job.matrix!))) matches.forEach((combo) => Object.assign(combo, extra));
    else if (!matches.length) combos.push({ ...extra });
  }
  return combos;
}

/** GitHub-style filter globs: `*` (no slash), `**` (anything), `?`, and `!` negation in lists. */
export function globToRegExp(pattern: string): RegExp {
  let source = '';
  for (let i = 0; i < pattern.length; i++) {
    const char = pattern[i]!;
    if (char === '*') {
      if (pattern[i + 1] === '*') { source += '.*'; i++; } else source += '[^/]*';
    } else if (char === '?') source += '.';
    else if (char === '+') source += '+';
    else source += char.replace(/[.^${}()|[\]\\]/g, '\\$&');
  }
  return new RegExp('^' + source + '$');
}

export function matchesFilters(value: string, patterns: string[]): boolean {
  let matched = false;
  for (const pattern of patterns) {
    if (pattern.startsWith('!')) { if (globToRegExp(pattern.slice(1)).test(value)) matched = false; }
    else if (globToRegExp(pattern).test(value)) matched = true;
  }
  return matched;
}
