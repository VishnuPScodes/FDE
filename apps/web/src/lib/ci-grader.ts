import type { Check } from '@fde/content-schema';
import { latestRun } from './ci-runtime';
import type { CiRunRecord, CiState } from './ci-types';

export interface CiCheckResult {
  kind: string;
  label: string;
  passed: boolean;
  actual: string;
  expected: string;
}

function runLine(run: CiRunRecord): string {
  return `#${run.number} ${run.workflowName} ${run.event} ${run.branch} ${run.status}/${run.conclusion ?? 'none'}`;
}

function jobLines(run: CiRunRecord | null | undefined): string[] {
  return (run?.jobs ?? []).map((job) => `job ${job.name} ${job.status === 'completed' ? job.conclusion : job.status} env=${job.environment ?? 'none'}`);
}

function runText(run: CiRunRecord | null | undefined): string {
  if (!run) return '';
  const lines = [runLine(run), ...jobLines(run)];
  for (const job of run.jobs) for (const step of job.steps) lines.push(`step ${job.name}/${step.name} ${step.conclusion}`);
  return lines.join('\n');
}

function logText(run: CiRunRecord | null | undefined): string {
  if (!run) return '';
  return run.jobs.flatMap((job) => [...job.steps.flatMap((step) => step.log), ...job.annotations]).concat(run.annotations).join('\n');
}

/** Resolves a `sim_state` path to text. Paths: runs, run (latest), log, jobs, deployments, environments, secrets, caches, registry, leaks, file:<path>. */
export function readCiPath(state: CiState, path: string): string {
  const latest = latestRun(state);
  switch (path) {
    case 'runs': return state.runs.map(runLine).join('\n');
    case 'run': case 'latest_run': return runText(latest);
    case 'jobs': return jobLines(latest).join('\n');
    case 'log': return logText(latest);
    case 'all_runs': return state.runs.map(runText).join('\n');
    case 'all_logs': return state.runs.map(logText).join('\n');
    case 'deployments': return state.deployments.map((item) => `${item.environment} ${item.version} ${item.status}`).join('\n');
    case 'environments': return Object.values(state.environments).map((env) => `${env.name} current=${env.current ?? 'none'} health=${env.health}`).join('\n');
    case 'secrets': return Object.keys(state.secrets).join('\n');
    case 'variables': return Object.keys(state.vars).join('\n');
    case 'caches': return Object.keys(state.caches).join('\n');
    case 'registry': return state.registry.join('\n');
    case 'leaks': return state.runs.flatMap((run) => run.leaks).join('\n');
    case 'pull_requests': return state.pullRequests.map((pr) => `#${pr.number} ${pr.head} -> ${pr.base} ${pr.state}`).join('\n');
    case '__stdout__': return state.stdout;
    case '__stderr__': return state.lastError;
    default:
      if (path.startsWith('file:')) return state.files[path.slice(5)] ?? '';
      if (path.startsWith('run:')) {
        const run = state.runs.find((item) => String(item.number) === path.slice(4));
        return runText(run);
      }
      return '';
  }
}

function readString(value: unknown): string {
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  return '';
}

export function gradeCiLevel(checks: Check[], state: CiState): CiCheckResult[] {
  return checks.map((check) => {
    const kind = check.kind;
    const label = typeof check.label === 'string' ? check.label : kind.replaceAll('_', ' ');
    let actual = '';
    let expected = '';
    let passed = false;
    if (kind === 'sim_command_used') {
      expected = readString(check.command ?? check.expected);
      actual = state.history.join('\n');
      passed = state.history.some((line) => line.trim() === expected || line.trim().startsWith(expected + ' '));
    } else if (kind === 'sim_state') {
      actual = readCiPath(state, readString(check.path));
      expected = readString(check.contains ?? check.not_contains ?? check.matches ?? check.expected);
      if (check.assert === 'exists' || check.exists === true) {
        expected = 'true';
        passed = actual.length > 0;
      } else if (check.not_contains !== undefined) {
        expected = 'not ' + readString(check.not_contains);
        passed = !actual.includes(readString(check.not_contains));
      } else if (check.matches !== undefined) {
        try { passed = new RegExp(readString(check.matches), 'm').test(actual); } catch { passed = false; }
      } else if (check.assert === 'equals' || check.expected !== undefined) {
        passed = actual === expected;
      } else {
        passed = actual.includes(expected);
      }
    } else {
      actual = 'Unsupported check: ' + kind;
      expected = 'sim_state or sim_command_used';
    }
    return { kind, label, passed, actual, expected };
  });
}
