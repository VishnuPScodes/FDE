import { describe, expect, it } from 'vitest';
import { createShellState, runShellCommand } from '../shell-runtime';
import { gradeShellLevel } from '../shell-grader';

function run(state: ReturnType<typeof createShellState>, command: string) {
  const result = runShellCommand(state, command);
  expect(result.exitCode).toBe(0);
  return result.state;
}

describe('simulated Linux shell', () => {
  it('supports navigation, directories, file redirection and inspection', () => {
    let state = createShellState();
    state = run(state, 'mkdir reports');
    state = run(state, 'cd reports');
    state = run(state, 'echo "Owner: Asha" > handoff.txt');
    const result = runShellCommand(state, 'cat handoff.txt');
    expect(result.stdout).toBe('Owner: Asha\n');
    expect(result.state.directories).toContain('/workspace/reports');
    expect(result.state.files['/workspace/reports/handoff.txt']).toBe('Owner: Asha\n');
  });

  it('pipes file content through grep and wc', () => {
    const state = createShellState({
      '/workspace/tickets.csv': 'id,priority\n1,high\n2,low\n3,high\n',
    });
    const result = runShellCommand(state, 'cat tickets.csv | grep high | wc -l');
    expect(result.stdout.trim().split(/\s+/)[0]).toBe('2');
    expect(
      gradeShellLevel(
        [{ kind: 'sim_state', assert: 'contains', path: '__stdout__', contains: ' 2 ' }],
        result.state,
      )[0]?.passed,
    ).toBe(true);
  });

  it('expands environment variables and grades shell state/history', () => {
    let state = createShellState();
    state = run(state, 'export TEAM=billing');
    const result = runShellCommand(state, 'echo $TEAM');
    expect(result.stdout).toBe('billing\n');
    expect(
      gradeShellLevel(
        [
          { kind: 'sim_state', path: '__env__:TEAM', expected: 'billing' },
          { kind: 'sim_command_used', command: 'echo $TEAM' },
        ],
        result.state,
      ).every((check) => check.passed),
    ).toBe(true);
  });

  it('returns a realistic error for missing files and blocks outside side effects', () => {
    const missing = runShellCommand(createShellState(), 'cat absent.txt');
    expect(missing.exitCode).toBe(1);
    expect(missing.stderr).toContain('No such file or directory');
    const network = runShellCommand(createShellState(), 'curl https://example.com');
    expect(network.exitCode).not.toBe(0);
    expect(network.stderr).toContain('network access is disabled');
  });
});
