import { evaluateExpression, interpolate, truthy, usesStatusFunction, type ExprContext, type ExprValue } from './ci-expressions';
import { executeJob, githubContext, shortHash, type NeedResult } from './ci-executor';
import { expandMatrix, formatIssue, isWorkflowPath, matchesFilters, parseWorkflow, type PullRequestFilter, type PushFilter, type Workflow, type WorkflowJob } from './ci-workflow';
import type { CiConclusion, CiDeployment, CiEnvironment, CiJobRecord, CiResult, CiRunRecord, CiState } from './ci-types';

/**
 * Orchestrates simulated GitHub Actions runs: triggers, job ordering (`needs`), matrices,
 * environment approvals and a text command line (push, pr, tag, dispatch, approve, reject).
 */

/** Hidden starter file that customises the simulated repository (environments, history, secrets). */
export const CI_WORLD_FILE = '.ci/world.json';

export interface CiWorld {
  repo?: string;
  actor?: string;
  image?: string;
  secrets?: Record<string, string>;
  vars?: Record<string, string>;
  registryVersions?: string[];
  deployments?: CiDeployment[];
  unhealthy?: Record<string, string[]>;
  environments?: Record<string, Partial<CiEnvironment>>;
  caches?: Record<string, string>;
}

const DEFAULT_IMAGE = 'ghcr.io/acme-pay/orders-api';

function defaultEnvironments(): Record<string, CiEnvironment> {
  return {
    staging: { name: 'staging', url: 'https://staging.orders.acme.in', reviewers: [], secrets: { DEPLOY_TOKEN: 'stg_tok_7Qm2xV9aLp41' }, current: '1.3.0', health: 'healthy' },
    production: { name: 'production', url: 'https://orders.acme.in', reviewers: ['meera'], secrets: { DEPLOY_TOKEN: 'prd_tok_Zk83nT5cWy07' }, current: '1.3.0', health: 'healthy' },
  };
}

export function isHiddenCiFile(path: string): boolean {
  return path === CI_WORLD_FILE;
}

export function createCiState(input: Record<string, string>): CiState {
  const { [CI_WORLD_FILE]: rawWorld, ...files } = input;
  let world: CiWorld = {};
  if (rawWorld) {
    try { world = JSON.parse(rawWorld) as CiWorld; } catch { world = {}; }
  }
  const image = world.image ?? DEFAULT_IMAGE;
  const environments = defaultEnvironments();
  for (const [name, patch] of Object.entries(world.environments ?? {})) {
    environments[name] = { ...(environments[name] ?? { name, url: '', reviewers: [], secrets: {}, current: null, health: 'unknown' }), ...patch, name };
  }
  const versions = world.registryVersions ?? ['1.3.0'];
  const deployments: CiDeployment[] = world.deployments ?? Object.values(environments).filter((env) => env.current).map((env) => ({ environment: env.name, version: env.current!, runId: null, status: 'success' as const }));
  const state: CiState = {
    repo: world.repo ?? 'acme-pay/orders-api',
    actor: world.actor ?? 'asha',
    image,
    files,
    index: {},
    commits: {},
    branches: {},
    currentBranch: 'main',
    upstream: [],
    remoteBranches: {},
    tags: {},
    remoteTags: {},
    pullRequests: [],
    runs: [],
    secrets: world.secrets ?? { REGISTRY_USER: 'acme-bot', REGISTRY_TOKEN: 'ghp_demoRegistryToken0042', API_KEY: 'sk_live_demo_51Hx9fQ2' },
    vars: world.vars ?? { APP_NAME: 'orders-api' },
    environments,
    deployments,
    unhealthy: world.unhealthy ?? {},
    registry: versions.map((version) => `${image}:${version}`),
    releases: [],
    caches: world.caches ?? {},
    branchProtection: {},
    history: [],
    stdout: 'CI simulator ready. Commands: push, pr, tag, dispatch, approve, reject, secret set, variable set.\n',
    stderr: '',
    lastError: '',
    counter: 0,
    nextRunId: 1001,
    nextJobId: 5001,
  };
  const sha = shortHash('initial' + JSON.stringify(files), 40);
  state.commits[sha] = { sha, parents: [], message: 'Initial commit', tree: { ...files } };
  state.branches.main = sha;
  state.remoteBranches.main = sha;
  return state;
}

// ─── Commands ───────────────────────────────────────────────────────────────

export type CiAction =
  | { type: 'push'; branch: string }
  | { type: 'tag'; name: string }
  | { type: 'pr'; branch: string }
  | { type: 'dispatch'; workflow: string; ref: string; inputs: Record<string, string> }
  | { type: 'approve' | 'reject'; environment: string }
  | { type: 'secret' | 'variable'; name: string; value: string };

export const CI_HELP = [
  'Commands:',
  '  push [branch]                 commit the files and push (default: main)',
  '  pr [branch]                   open or update a pull request from a branch into main',
  '  tag <name>                    tag the current files and push the tag (for example v1.4.0)',
  '  dispatch [file] [--ref b] k=v run a workflow with the workflow_dispatch trigger',
  '  approve [environment]         approve a waiting deployment',
  '  reject [environment]          reject a waiting deployment',
  '  secret set NAME=value         add a repository secret',
  '  variable set NAME=value       add a repository variable',
].join('\n');

export function parseCiAction(line: string): CiAction | string {
  const words = line.trim().replace(/^(?:git|gh)\s+/, '').split(/\s+/).filter(Boolean);
  const [command = '', ...rest] = words;
  switch (command) {
    case 'push': return { type: 'push', branch: rest.find((word) => !word.startsWith('-') && word !== 'origin') ?? 'main' };
    case 'pr': return { type: 'pr', branch: rest[0] ?? 'feature/update' };
    case 'tag': return rest[0] ? { type: 'tag', name: rest[0] } : 'Usage: tag <name>';
    case 'approve': case 'reject': return { type: command, environment: rest[0] ?? '' };
    case 'dispatch': {
      let workflow = '';
      let ref = 'main';
      const inputs: Record<string, string> = {};
      for (let i = 0; i < rest.length; i++) {
        const word = rest[i]!;
        if (word === '--ref') ref = rest[++i] ?? 'main';
        else if (word.includes('=')) inputs[word.slice(0, word.indexOf('='))] = word.slice(word.indexOf('=') + 1);
        else workflow = word;
      }
      return { type: 'dispatch', workflow, ref, inputs };
    }
    case 'secret': case 'variable': {
      const pair = rest.filter((word) => word !== 'set').join(' ');
      const eq = pair.indexOf('=');
      if (eq <= 0) return `Usage: ${command} set NAME=value`;
      return { type: command, name: pair.slice(0, eq).trim(), value: pair.slice(eq + 1).trim() };
    }
    default: return `Unknown command '${command}'.\n${CI_HELP}`;
  }
}

export function runCiCommand(state: CiState, line: string): CiResult {
  const text = line.trim();
  if (text === 'help' || text === '--help') return { state, stdout: CI_HELP + '\n', stderr: '', exitCode: 0 };
  const action = parseCiAction(text);
  if (typeof action === 'string') return { state, stdout: '', stderr: action + '\n', exitCode: 1 };
  const next = structuredClone(state);
  const out: string[] = [];
  const err: string[] = [];
  perform(next, action, out, err);
  next.history = [...next.history, text];
  next.stdout = out.length ? out.join('\n') + '\n' : '';
  next.stderr = err.length ? err.join('\n') + '\n' : '';
  next.lastError = next.stderr;
  return { state: next, stdout: next.stdout, stderr: next.stderr, exitCode: err.length ? 1 : 0 };
}

function perform(state: CiState, action: CiAction, out: string[], err: string[]): void {
  switch (action.type) {
    case 'push': {
      const commit = commitFiles(state, action.branch, 'Update ' + action.branch);
      out.push(`To github.com:${state.repo}.git`, `   ${commit.previous?.slice(0, 7) ?? '0000000'}..${commit.sha.slice(0, 7)}  ${action.branch} -> ${action.branch}`);
      fire(state, 'push', `refs/heads/${action.branch}`, action.branch, commit.sha, commit.changed, {}, null, out);
      return;
    }
    case 'tag': {
      const sha = commitFiles(state, state.currentBranch, 'Release ' + action.name).sha;
      state.tags[action.name] = sha;
      state.remoteTags[action.name] = sha;
      out.push(`To github.com:${state.repo}.git`, ` * [new tag]         ${action.name} -> ${action.name}`);
      fire(state, 'push', `refs/tags/${action.name}`, action.name, sha, [], {}, null, out);
      return;
    }
    case 'pr': {
      const base = 'main';
      if (action.branch === base) { err.push('Error: the head branch must differ from main.'); return; }
      const commit = commitFiles(state, action.branch, 'Changes from ' + action.branch);
      let pr = state.pullRequests.find((item) => item.head === action.branch && item.state === 'open');
      const created = !pr;
      if (!pr) {
        pr = { number: state.pullRequests.length + 1, title: 'Changes from ' + action.branch, body: '', head: action.branch, base, state: 'open', headSha: commit.sha };
        state.pullRequests.push(pr);
      }
      pr.headSha = commit.sha;
      const baseTree = state.commits[state.branches[base] ?? '']?.tree ?? {};
      out.push(`${created ? 'Created' : 'Updated'} pull request #${pr.number}: ${action.branch} into ${base}`);
      fire(state, 'pull_request', `refs/pull/${pr.number}/merge`, action.branch, commit.sha, changedFiles(baseTree, state.files), {}, pr.number, out, created ? 'opened' : 'synchronize');
      return;
    }
    case 'dispatch': {
      const sha = state.branches[action.ref];
      if (!sha) { err.push(`Error: no branch named '${action.ref}' has been pushed.`); return; }
      const tree = state.commits[sha]!.tree;
      const files = Object.keys(tree).filter(isWorkflowPath);
      const pick = action.workflow
        ? files.find((file) => file === action.workflow || file.endsWith('/' + action.workflow))
        : files.find((file) => { const parsed = parseWorkflow(file, tree[file]!); return Boolean(parsed.workflow?.triggers.workflow_dispatch); }) ?? files[0];
      if (!pick) { err.push(action.workflow ? `Error: could not find workflow '${action.workflow}' on ${action.ref}.` : `Error: no workflow files found on ${action.ref}. Push your workflow first.`); return; }
      const parsed = parseWorkflow(pick, tree[pick]!);
      if (!parsed.workflow) { err.push(...parsed.errors.map(formatIssue)); return; }
      const config = parsed.workflow.triggers.workflow_dispatch;
      if (!config) { err.push(`HTTP 422: Workflow does not have 'workflow_dispatch' trigger`, 'Add `workflow_dispatch:` under `on:` and push the change first.'); return; }
      const inputs: Record<string, string> = {};
      const unknown = Object.keys(action.inputs).filter((name) => !config.inputs[name]);
      if (unknown.length) { err.push(`HTTP 422: Unexpected inputs provided: [${unknown.map((name) => `"${name}"`).join(', ')}]`); return; }
      for (const [name, def] of Object.entries(config.inputs)) {
        const value = action.inputs[name] ?? def.default;
        if (value === undefined) {
          if (def.required) { err.push(`HTTP 422: Required input '${name}' not provided`); return; }
          continue;
        }
        if (def.type === 'choice' && def.options.length && !def.options.includes(value)) {
          err.push(`HTTP 422: Provided value '${value}' for input '${name}' not in the list of allowed values`);
          return;
        }
        inputs[name] = value;
      }
      out.push(`Created workflow_dispatch event for ${pick} at ${action.ref}`);
      startRun(state, parsed.workflow, 'workflow_dispatch', `refs/heads/${action.ref}`, action.ref, sha, inputs, null, out);
      return;
    }
    case 'approve': case 'reject': {
      const waiting = [...state.runs].reverse().filter((run) => run.status === 'waiting').reverse();
      const run = waiting.find((item) => !action.environment || item.jobs.some((job) => job.status === 'waiting' && job.environment === action.environment)) ?? null;
      if (!run) { err.push(action.environment ? `No run is waiting for review of environment '${action.environment}'.` : 'No run is waiting for approval.'); return; }
      const names = [...new Set(run.jobs.filter((job) => job.status === 'waiting' && job.environment && (!action.environment || job.environment === action.environment)).map((job) => job.environment!))];
      for (const job of run.jobs) {
        if (job.status !== 'waiting' || !names.includes(job.environment ?? '')) continue;
        if (action.type === 'reject') {
          job.status = 'completed';
          job.conclusion = 'cancelled';
          job.annotations.push(`Deployment to ${job.environment} was rejected by a reviewer.`);
        }
      }
      if (action.type === 'approve') run.approvedEnvironments.push(...names);
      out.push(`${action.type === 'approve' ? 'Approved' : 'Rejected'} deployment to ${names.join(', ')} for run #${run.number}`);
      const parsed = loadWorkflow(state, run);
      if (parsed) advance(state, run, parsed);
      out.push(...summarize(run));
      return;
    }
    case 'secret': {
      state.secrets[action.name] = action.value;
      out.push(`✓ Set Actions secret ${action.name} for ${state.repo}`);
      return;
    }
    case 'variable': {
      state.vars[action.name] = action.value;
      out.push(`✓ Created variable ${action.name} for ${state.repo}`);
    }
  }
}

function changedFiles(before: Record<string, string>, after: Record<string, string>): string[] {
  const paths = new Set([...Object.keys(before), ...Object.keys(after)]);
  return [...paths].filter((path) => before[path] !== after[path]).sort();
}

function commitFiles(state: CiState, branch: string, message: string): { sha: string; previous: string | undefined; changed: string[] } {
  const previous = state.branches[branch];
  const baseline = state.commits[previous ?? state.branches.main ?? '']?.tree ?? {};
  state.counter += 1;
  const sha = shortHash(JSON.stringify(state.files) + message + String(state.counter), 40);
  state.commits[sha] = { sha, parents: previous ? [previous] : [], message, tree: { ...state.files } };
  state.branches[branch] = sha;
  state.remoteBranches[branch] = sha;
  state.currentBranch = branch;
  return { sha, previous, changed: changedFiles(baseline, state.files) };
}

// ─── Triggers ───────────────────────────────────────────────────────────────

function pushMatches(filter: PushFilter, ref: string, name: string, changed: string[]): boolean {
  const isTag = ref.startsWith('refs/tags/');
  const hasBranch = filter.branches !== undefined || filter.branchesIgnore !== undefined;
  const hasTag = filter.tags !== undefined || filter.tagsIgnore !== undefined;
  if (isTag) {
    if (hasTag) {
      if (filter.tags && !matchesFilters(name, filter.tags)) return false;
      if (filter.tagsIgnore && matchesFilters(name, filter.tagsIgnore)) return false;
      return true;
    }
    return !hasBranch;
  }
  if (hasBranch) {
    if (filter.branches && !matchesFilters(name, filter.branches)) return false;
    if (filter.branchesIgnore && matchesFilters(name, filter.branchesIgnore)) return false;
  } else if (hasTag) return false;
  return pathsMatch(filter, changed);
}

function pathsMatch(filter: PushFilter | PullRequestFilter, changed: string[]): boolean {
  if (filter.paths && !changed.some((path) => matchesFilters(path, filter.paths!))) return false;
  if (filter.pathsIgnore && changed.length > 0 && changed.every((path) => matchesFilters(path, filter.pathsIgnore!))) return false;
  return true;
}

function pullRequestMatches(filter: PullRequestFilter, base: string, changed: string[], action: string): boolean {
  if (filter.types && !filter.types.includes(action)) return false;
  if (!filter.types && !['opened', 'synchronize', 'reopened'].includes(action)) return false;
  if (filter.branches && !matchesFilters(base, filter.branches)) return false;
  if (filter.branchesIgnore && matchesFilters(base, filter.branchesIgnore)) return false;
  return pathsMatch(filter, changed);
}

function fire(
  state: CiState, event: 'push' | 'pull_request', ref: string, name: string, sha: string, changed: string[],
  inputs: Record<string, string>, prNumber: number | null, out: string[], action = 'opened',
): void {
  const tree = state.commits[sha]!.tree;
  const triggered: string[] = [];
  for (const file of Object.keys(tree).filter(isWorkflowPath).sort()) {
    const parsed = parseWorkflow(file, tree[file]!);
    if (!parsed.workflow) {
      const run = newRun(state, file.replace(/^\.github\/workflows\//, ''), file, event, ref, name, sha, inputs, prNumber);
      run.status = 'completed';
      run.conclusion = 'failure';
      run.annotations.push(...parsed.errors.map(formatIssue));
      state.runs.push(run);
      out.push(`✗ ${file} is not a valid workflow:`, ...parsed.errors.map(formatIssue));
      state.lastError = parsed.errors.map(formatIssue).join('\n');
      continue;
    }
    const triggers = parsed.workflow.triggers;
    const matched = event === 'push'
      ? Boolean(triggers.push) && pushMatches(triggers.push!, ref, name, changed)
      : Boolean(triggers.pull_request) && pullRequestMatches(triggers.pull_request!, 'main', changed, action);
    if (!matched) continue;
    triggered.push(parsed.workflow.name);
    startRun(state, parsed.workflow, event, ref, name, sha, inputs, prNumber, out);
  }
  if (!triggered.length) out.push(`No workflow was triggered by this ${event === 'push' ? (ref.startsWith('refs/tags/') ? 'tag push' : 'push') : 'pull request'}.`);
}

function newRun(
  state: CiState, workflowName: string, file: string, event: string, ref: string, branch: string, sha: string,
  inputs: Record<string, string>, prNumber: number | null,
): CiRunRecord {
  const number = state.runs.filter((run) => run.workflowFile === file).length + 1;
  return {
    id: state.nextRunId++, number, workflowName, workflowFile: file, event, branch, ref, sha,
    title: state.commits[sha]?.message ?? '', status: 'queued', conclusion: null, attempt: 1, jobs: [],
    inputs, prNumber, annotations: [], approvedEnvironments: [], leaks: [],
  };
}

function startRun(
  state: CiState, workflow: Workflow, event: string, ref: string, branch: string, sha: string,
  inputs: Record<string, string>, prNumber: number | null, out: string[],
): void {
  const run = newRun(state, workflow.name, workflow.file, event, ref, branch, sha, inputs, prNumber);
  for (const job of workflow.jobs) {
    const combos = job.matrix || job.include.length ? expandMatrix(job) : [null];
    for (const combo of combos) {
      const base = job.name ?? job.key;
      const record: CiJobRecord = {
        id: state.nextJobId++, key: job.key,
        name: combo ? `${base} (${Object.values(combo).join(', ')})` : base,
        status: 'queued', conclusion: null, steps: [], seconds: 0,
        environment: job.environment?.name ?? null, matrix: combo, outputs: {}, annotations: [],
      };
      if (record.environment?.includes('${{')) {
        const context: ExprContext = { contexts: { github: githubContext(state, run), inputs: { ...run.inputs }, vars: { ...state.vars }, matrix: combo ?? {} } };
        try { record.environment = interpolate(record.environment, context); } catch { record.environment = null; }
      }
      if (record.environment && !state.environments[record.environment]) {
        state.environments[record.environment] = { name: record.environment, url: '', reviewers: [], secrets: {}, current: null, health: 'unknown' };
      }
      run.jobs.push(record);
    }
  }
  state.runs.push(run);
  advance(state, run, workflow);
  out.push(...summarize(run));
}

function loadWorkflow(state: CiState, run: CiRunRecord): Workflow | null {
  const source = state.commits[run.sha]?.tree[run.workflowFile];
  return source === undefined ? null : parseWorkflow(run.workflowFile, source).workflow;
}

function needResult(records: CiJobRecord[]): NeedResult {
  const conclusions = records.map((record) => record.conclusion);
  const result: CiConclusion = conclusions.includes('failure') ? 'failure'
    : conclusions.includes('cancelled') ? 'cancelled'
      : conclusions.every((item) => item === 'skipped') ? 'skipped' : 'success';
  const last = [...records].reverse().find((record) => record.conclusion === 'success');
  return { result, outputs: { ...(last?.outputs ?? {}) } };
}

function advance(state: CiState, run: CiRunRecord, workflow: Workflow): void {
  const tree = state.commits[run.sha]!.tree;
  const byKey = new Map<string, WorkflowJob>(workflow.jobs.map((job) => [job.key, job]));
  let progress = true;
  while (progress) {
    progress = false;
    for (const record of run.jobs) {
      if (record.status === 'completed') continue;
      const job = byKey.get(record.key)!;
      const upstream = job.needs.map((key) => run.jobs.filter((item) => item.key === key));
      if (upstream.some((group) => group.some((item) => item.status !== 'completed'))) continue;
      const needs: Record<string, NeedResult> = Object.fromEntries(job.needs.map((key, index) => [key, needResult(upstream[index]!)]));
      const results = Object.values(needs).map((item) => item.result);
      const allOk = results.every((item) => item === 'success');
      const context: ExprContext = {
        contexts: {
          github: githubContext(state, run), needs: needs as unknown as Record<string, ExprValue>, vars: { ...state.vars },
          inputs: { ...run.inputs }, matrix: record.matrix ?? {}, env: { ...workflow.env },
        },
        status: { success: allOk, failure: results.includes('failure'), cancelled: false },
      };
      let go = allOk;
      if (job.if !== undefined) {
        try {
          const condition = job.if.replace(/^\s*\$\{\{([\s\S]*)\}\}\s*$/, '$1');
          const value = truthy(evaluateExpression(condition, context));
          go = usesStatusFunction(condition) ? value : allOk && value;
        } catch (error) {
          record.annotations.push(error instanceof Error ? error.message : String(error));
          go = false;
        }
      }
      if (!go) {
        record.status = 'completed';
        record.conclusion = 'skipped';
        progress = true;
        continue;
      }
      const environment = record.environment ? state.environments[record.environment] : undefined;
      if (environment?.reviewers.length && !run.approvedEnvironments.includes(environment.name)) {
        record.status = 'waiting';
        continue;
      }
      executeJob(state, run, workflow, job, record, tree, needs);
      progress = true;
    }
  }
  if (run.jobs.some((job) => job.status !== 'completed')) {
    run.status = run.jobs.some((job) => job.status === 'waiting') ? 'waiting' : 'queued';
    run.conclusion = null;
    return;
  }
  const all = run.jobs.map((job) => job.conclusion);
  run.status = 'completed';
  run.conclusion = all.includes('failure') ? 'failure' : all.includes('cancelled') ? 'cancelled' : 'success';
}

export function summarize(run: CiRunRecord): string[] {
  const state = run.status === 'completed' ? run.conclusion ?? 'unknown' : run.status === 'waiting' ? 'waiting for approval' : run.status;
  const lines = [`Run #${run.number} of ${run.workflowName} (${run.event} on ${run.branch}): ${state}`];
  for (const job of run.jobs) {
    const mark = job.conclusion === 'success' ? '✓' : job.conclusion === 'failure' ? '✗' : job.conclusion === 'skipped' ? '-' : job.conclusion === 'cancelled' ? '⊘' : '…';
    const detail = job.status === 'waiting' ? `waiting for review (${job.environment})` : job.conclusion ?? job.status;
    lines.push(`  ${mark} ${job.name}: ${detail}`);
  }
  for (const note of run.annotations) lines.push(`  ! ${note}`);
  return lines;
}

/** The most recent run, or null. */
export function latestRun(state: CiState): CiRunRecord | null {
  return state.runs.length ? state.runs[state.runs.length - 1]! : null;
}
