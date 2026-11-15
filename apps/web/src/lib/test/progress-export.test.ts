import { describe, expect, it } from 'vitest';
import { importProgressRows, getLocalProgress, parseProgressImport, serializeProgressExport, type ProgressRow } from '../progress';

const row: ProgressRow = { level_id: 'a-1', status: 'passed', attempts: 2, hints_used: 1, time_spent_sec: 30, passed_at: '2026-01-01T00:00:00.000Z' };

describe('progress export/import', () => {
  it('round-trips an export', () => {
    const parsed = parseProgressImport(serializeProgressExport([row]));
    expect(parsed).toEqual({ ok: true, rows: [row], skipped: 0 });
  });
  it('accepts a bare array and skips bad rows', () => {
    const parsed = parseProgressImport(JSON.stringify([row, { level_id: 5 }, null, { ...row, status: 'weird' }, { ...row, attempts: -1 }]));
    expect(parsed).toEqual({ ok: true, rows: [row], skipped: 4 });
  });
  it('rejects garbage without throwing', () => {
    for (const text of ['', 'nope', '{}', '42', 'null', '{"progress":"x"}', '{"progress":[]}', '[{"a":1}]']) {
      expect(parseProgressImport(text).ok).toBe(false);
    }
  });
  it('merges into local storage without downgrading passes', () => {
    localStorage.clear();
    importProgressRows([row]);
    importProgressRows([{ ...row, status: 'in_progress', attempts: 1, passed_at: null }]);
    const stored = getLocalProgress()[0]!;
    expect(stored.status).toBe('passed');
    expect(stored.attempts).toBe(2);
  });
});
