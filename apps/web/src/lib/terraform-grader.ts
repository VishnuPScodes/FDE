import type { Check } from '@fde/content-schema';
import type { SubmissionCheckResult } from '../hooks/useLevelSubmission';
import { planStatus, showValue, type TfState } from './terraform/engine';

function text(value: unknown): string {
  return typeof value === 'string' ? value : typeof value === 'number' || typeof value === 'boolean' ? String(value) : '';
}

/**
 * Grade a Terraform workspace. Supported `sim_state` paths:
 * resources, resource:<address>, outputs, output:<name>, plan_clean, file:<name>, __stdout__, __stderr__.
 * `sim_command_used` matches a command the learner ran.
 */
export function gradeTerraformLevel(checks: Check[], state: TfState): SubmissionCheckResult[] {
  return checks.map((check) => {
    const kind = check.kind;
    const label = typeof check.label === 'string' ? check.label : kind.replaceAll('_', ' ');
    let actual = '';
    let expected = '';
    let passed = false;
    if (kind === 'sim_command_used') {
      expected = text(check.command ?? check.expected);
      actual = state.history.join('\n');
      passed = state.history.some((line) => line.trim() === expected || line.trim().startsWith(expected + ' '));
    } else if (kind === 'sim_state') {
      const path = text(check.path);
      if (path === 'resources') actual = state.resources.map((r) => r.address).sort().join('\n');
      else if (path.startsWith('resource:')) {
        const found = state.resources.find((r) => r.address === path.slice('resource:'.length));
        actual = found ? JSON.stringify(found.attrs) : '';
      } else if (path === 'outputs') actual = Object.entries(state.outputs).map(([k, o]) => k + '=' + showValue(o.value)).join('\n');
      else if (path.startsWith('output:')) {
        const found = state.outputs[path.slice('output:'.length)];
        actual = found ? (typeof found.value === 'string' ? found.value : JSON.stringify(found.value)) : '';
      } else if (path === 'plan_clean') {
        const status = planStatus(state);
        actual = String(status.clean) + (status.clean ? '' : ` (${status.summary.split('\n')[0]})`);
      } else if (path.startsWith('file:')) actual = state.files[path.slice('file:'.length)] ?? '';
      else if (path === '__stdout__') actual = state.stdout;
      else if (path === '__stderr__') actual = state.lastError;
      expected = text(check.contains ?? check.expected);
      if (check.assert === 'exists' || check.exists === true) { expected = 'true'; passed = actual.length > 0; }
      else if (path === 'plan_clean') { expected = 'true'; passed = actual === 'true'; }
      else if (check.assert === 'equals' || check.expected !== undefined) passed = actual === expected;
      else passed = actual.includes(expected);
      if (check.not_contains !== undefined) { expected = 'no ' + text(check.not_contains); passed = passed && !actual.includes(text(check.not_contains)); }
    } else {
      actual = 'Unsupported check: ' + kind;
      expected = 'sim_state or sim_command_used';
    }
    return { kind, label, passed, actual, expected };
  });
}
