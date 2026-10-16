import { describe, expect, it, vi } from 'vitest';
import { gradePythonLevel } from '../grader';

describe('Python level grader', () => {
  it('checks exact stdout and applies the requested whitespace normalization', async () => {
    const run = vi.fn().mockResolvedValue({ stdout: 'Meera: ₹1200  \n', stderr: '', exitCode: 0 });
    const results = await gradePythonLevel({ checks: [
      { kind: 'stdout_equals', run: 'python main.py', expected: 'Meera: ₹1200\n', normalize: ['trim_trailing_whitespace'] },
    ] }, { 'main.py': 'print("receipt")' }, run);
    expect(results[0]?.passed).toBe(true);
    expect(run).toHaveBeenCalledWith('python main.py');
  });

  it('returns matching learner feedback for a common output mistake', async () => {
    const run = vi.fn().mockResolvedValue({ stdout: 'vishnu\n', stderr: '', exitCode: 0 });
    const results = await gradePythonLevel({
      checks: [{ kind: 'stdout_equals', expected: 'Vishnu\n' }],
      feedback: [{ when: { stdout_contains: 'vishnu' }, message: 'Check the capital V.' }],
    }, { 'main.py': 'print("vishnu")' }, run);
    expect(results[0]?.passed).toBe(false);
    expect(results[0]?.feedback).toBe('Check the capital V.');
  });

  it('checks virtual files without running Python', async () => {
    const run = vi.fn();
    const results = await gradePythonLevel({ checks: [
      { kind: 'file_exists', path: 'main.py', expected: true },
      { kind: 'file_contains', path: 'main.py', expected: 'def invoice_total' },
    ] }, { 'main.py': 'def invoice_total(amounts): return sum(amounts)' }, run);
    expect(results.every((result) => result.passed)).toBe(true);
    expect(run).not.toHaveBeenCalled();
  });

  it('uses pytest exit status for pytest checks', async () => {
    const run = vi.fn().mockResolvedValue({ stdout: '1 passed', stderr: '', exitCode: 0 });
    const results = await gradePythonLevel({ checks: [{ kind: 'pytest_passes', run: 'pytest -q test_invoice.py' }] }, {}, run);
    expect(results[0]?.passed).toBe(true);
    expect(run).toHaveBeenCalledWith('pytest -q test_invoice.py');
  });
});
