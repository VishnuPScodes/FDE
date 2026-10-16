import { describe, expect, it } from 'vitest';
import { gradeTypeScriptLevel } from '../typescript-grader';

describe('TypeScript level checks', () => {
  const run = { stdout: '3 passed, 0 failed', stderr: '', passed: 3, failed: 0, preview: 'Invoice admin' };

  it('checks embedded tests, preview text, and output', () => {
    const checks = gradeTypeScriptLevel([
      { kind: 'vitest_passes' },
      { kind: 'preview_contains', expected: 'Invoice' },
      { kind: 'stdout_equals', expected: '3 passed, 0 failed' },
    ], {}, run);
    expect(checks.every((check) => check.passed)).toBe(true);
  });

  it('does not pass a broken run or a mismatched preview', () => {
    const checks = gradeTypeScriptLevel([
      { kind: 'vitest_passes' },
      { kind: 'preview_contains', expected: 'Customers' },
    ], {}, { ...run, failed: 1, preview: '' });
    expect(checks.map((check) => check.passed)).toEqual([false, false]);
  });
});
