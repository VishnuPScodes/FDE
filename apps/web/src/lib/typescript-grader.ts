import type { Check } from '@fde/content-schema';
import type { WorkspaceFiles } from './virtual-files';

export interface TypeScriptRunResult { stdout: string; stderr: string; passed: number; failed: number; preview: string }
export interface TypeScriptCheckResult { kind: string; label: string; passed: boolean; expected: string; actual: string }

export function gradeTypeScriptLevel(checks: Check[], files: WorkspaceFiles, result: TypeScriptRunResult): TypeScriptCheckResult[] {
  return checks.map((check) => {
    const label = typeof check.label === 'string' ? check.label : check.kind.replaceAll('_', ' ');
    const expected = check.expected === undefined ? '' : String(check.expected);
    let actual = '';
    let passed = false;
    if (check.kind === 'vitest_passes' || check.kind === 'pytest_passes') {
      actual = `${result.passed} passed, ${result.failed} failed`;
      passed = result.failed === 0 && result.passed > 0;
    } else if (check.kind === 'stdout_equals') {
      actual = result.stdout;
      passed = actual.trimEnd() === expected.trimEnd();
    } else if (check.kind === 'stdout_matches') {
      actual = result.stdout;
      try { passed = new RegExp(expected).test(actual); } catch { passed = false; }
    } else if (check.kind === 'exit_code') {
      actual = String(result.stderr || result.failed ? 1 : 0);
      passed = Number(actual) === Number(check.expected ?? 0);
    } else if (check.kind === 'preview_contains') {
      actual = result.preview;
      passed = actual.includes(expected);
    } else if (check.kind === 'file_exists') {
      actual = String(Object.hasOwn(files, String(check.path ?? '')));
      passed = actual === 'true' && check.expected !== false;
    } else if (check.kind === 'file_contains') {
      actual = files[String(check.path ?? '')] ?? '';
      passed = actual.includes(expected);
    } else if (check.kind === 'stderr_contains') {
      actual = result.stderr;
      passed = actual.includes(expected);
    }
    return { kind: check.kind, label, passed, expected, actual };
  });
}
