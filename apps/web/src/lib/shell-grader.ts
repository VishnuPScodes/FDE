import type { Check } from '@fde/content-schema';
import type { ShellState } from './shell-runtime';

export interface ShellCheckResult {
  kind: string;
  label: string;
  passed: boolean;
  actual: string;
  expected: string;
}

export function gradeShellLevel(checks: Check[], state: ShellState): ShellCheckResult[] {
  return checks.map((check) => {
    const kind = check.kind;
    const label = typeof check.label === 'string' ? check.label : kind.replaceAll('_', ' ');
    let actual = '';
    let expected = '';
    let passed = false;
    if (kind === 'sim_state') {
      const path = stringValue(check.path);
      const value = state.files[path];
      const exists = Object.hasOwn(state.files, path) || state.directories.includes(path);
      if (path.startsWith('__env__:')) {
        actual = state.env[path.slice('__env__:'.length)] ?? '';
        expected = stringValue(check.expected);
        passed = actual === expected;
      } else if (path === '__stdout__') {
        actual = state.lastStdout;
        expected = stringValue(check.contains ?? check.expected);
        passed = check.assert === 'contains' ? actual.includes(expected) : actual === expected;
      } else if (check.assert === 'exists' || check.exists === true) {
        actual = String(exists);
        expected = 'true';
        passed = exists;
      } else if (check.assert === 'contains' || check.contains !== undefined) {
        actual = value ?? '';
        expected = stringValue(check.contains ?? check.expected);
        passed = actual.includes(expected);
      } else if (check.assert === 'equals' || check.expected !== undefined) {
        actual = value ?? '';
        expected = stringValue(check.expected);
        passed = actual === expected;
      } else {
        actual = JSON.stringify(state);
        expected = 'supported shell state assertion';
      }
    } else if (kind === 'sim_command_used') {
      expected = stringValue(check.command ?? check.expected);
      actual = state.history.join('\n');
      passed = state.history.some(
        (line) => line.trim() === expected || line.trim().startsWith(`${expected} `),
      );
    } else {
      actual = `Unsupported check: ${kind}`;
      expected = 'sim_state or sim_command_used';
    }
    return { kind, label, passed, actual, expected };
  });
}

function stringValue(value: unknown): string {
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  return '';
}
