import type { Check } from '@fde/content-schema';
import type { DockerState } from './docker-runtime';

export interface DockerCheckResult {
  kind: string;
  label: string;
  passed: boolean;
  actual: string;
  expected: string;
}

export function gradeDockerLevel(checks: Check[], state: DockerState): DockerCheckResult[] {
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
      const path = readString(check.path);
      if (path === 'images') {
        actual = state.images.map((image) => image.tag + ' ' + image.sizeMb + 'MB user=' + image.user + ' stages=' + image.stages.join(',')).join('\n');
      } else if (path === 'containers') {
        actual = state.containers.map((item) => item.name + ' ' + item.status + ' ' + item.image + ' ports=' + item.ports.join(',') + ' health=' + item.health + ' env=' + Object.entries(item.environment).map(([key, value]) => key + '=' + value).join(',')).join('\n');
      } else if (path === 'registry') {
        actual = state.registry.join('\n');
      } else if (path === 'networks') {
        actual = state.networks.join('\n');
      } else if (path === 'volumes') {
        actual = state.volumes.join('\n');
      } else if (path === 'logged_in') {
        actual = String(state.loggedIn);
      } else if (path === '__stdout__') {
        actual = state.stdout;
      } else if (path === '__stderr__') {
        actual = state.lastError;
      } else if (path.startsWith('image:')) {
        const image = state.images.find((item) => item.tag === path.slice('image:'.length));
        actual = image ? JSON.stringify(image) : '';
      }
      expected = readString(check.contains ?? check.expected);
      if (check.assert === 'exists' || check.exists === true) {
        expected = 'true';
        passed = actual.length > 0;
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

function readString(value: unknown): string {
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  return '';
}
