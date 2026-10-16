import type { Check, FeedbackRule } from '@fde/content-schema';
import type { PythonRunResult } from './python-runtime';
import type { WorkspaceFiles } from './virtual-files';

export interface CheckResult { kind: string; label: string; passed: boolean; actual: string; expected: string; feedback?: string }

export async function gradePythonLevel(level: { checks: Check[]; feedback?: FeedbackRule[] }, files: WorkspaceFiles, run: (command: string) => Promise<PythonRunResult>): Promise<CheckResult[]> {
  const results: CheckResult[] = [];
  for (const check of level.checks) {
    results.push(await evaluateCheck(check, files, run, level.feedback));
  }
  return results;
}

async function evaluateCheck(check: Check, files: WorkspaceFiles, run: (command: string) => Promise<PythonRunResult>, feedbackRules: FeedbackRule[] = []): Promise<CheckResult> {
  const kind = check.kind;
  const label = typeof check.label === 'string' ? check.label : kind.replaceAll('_', ' ');
  const expected = check.expected === undefined ? '' : String(check.expected);
  let actual = '';
  let output = '';
  let errors = '';
  let passed = false;
  if (kind === 'file_exists') {
    const path = String(check.path ?? '');
    actual = String(Object.hasOwn(files, path));
    passed = actual === 'true' && check.expected !== false;
  } else if (kind === 'file_contains') {
    actual = files[String(check.path ?? '')] ?? '';
    const needle = String(check.expected ?? '');
    passed = actual.includes(needle);
  } else if (kind === 'pytest_passes') {
    const result = await run(typeof check.run === 'string' ? check.run : 'pytest -q');
    actual = result.stdout + result.stderr;
    output = result.stdout;
    errors = result.stderr;
    passed = result.exitCode === 0;
  } else {
    const result = await run(typeof check.run === 'string' ? check.run : 'python main.py');
    output = result.stdout;
    errors = result.stderr;
    if (kind === 'stdout_equals') {
      actual = normalize(result.stdout, check.normalize);
      const target = normalize(expected, check.normalize);
      passed = actual === target;
    } else if (kind === 'stdout_matches') {
      actual = result.stdout;
      try { passed = new RegExp(String(check.expected ?? '')).test(actual); } catch { passed = false; }
    } else if (kind === 'stderr_contains') {
      actual = result.stderr;
      passed = actual.includes(expected);
    } else if (kind === 'exit_code') {
      actual = String(result.exitCode);
      passed = result.exitCode === Number(check.expected ?? 0);
    } else {
      actual = `Unsupported check: ${kind}`;
    }
  }
  return { kind, label, passed, actual, expected, ...(passed ? {} : { feedback: matchingFeedback(feedbackRules, output, errors) }) };
}

function normalize(value: string, options: unknown): string {
  if (!Array.isArray(options)) return value;
  return options.includes('trim_trailing_whitespace') ? value.replace(/[\t ]+$/gm, '') : value;
}

function matchingFeedback(rules: FeedbackRule[], stdout: string, stderr: string): string | undefined {
  return rules.find((rule) => Object.entries(rule.when).every(([key, value]) => {
    if (key === 'stdout_contains') return stdout.toLowerCase().includes(String(value).toLowerCase());
    if (key === 'stderr_contains') return stderr.toLowerCase().includes(String(value).toLowerCase());
    return false;
  }))?.message;
}
