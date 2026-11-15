import { describe, expect, it } from 'vitest';
import { completeLine, stepHistory } from '../terminal-input';

describe('stepHistory', () => {
  const h = ['a', 'b', 'c'];
  it('walks back and forth', () => {
    expect(stepHistory(h, -1, 'up')).toEqual({ index: 0, line: 'c' });
    expect(stepHistory(h, 0, 'up')).toEqual({ index: 1, line: 'b' });
    expect(stepHistory(h, 2, 'up')).toEqual({ index: 2, line: 'a' });
    expect(stepHistory(h, 0, 'down')).toEqual({ index: -1, line: null });
  });
  it('handles empty history', () => {
    expect(stepHistory([], -1, 'up')).toEqual({ index: -1, line: null });
  });
});

describe('completeLine', () => {
  const phrases = ['git status', 'git stash', 'git stash pop', 'git commit -m'];
  it('completes a unique token with a trailing space', () => {
    expect(completeLine('git com', phrases).value).toBe('git commit ');
  });
  it('extends to the common prefix and lists options', () => {
    const r = completeLine('git s', phrases);
    expect(r.value).toBe('git sta');
    expect(r.options).toEqual(['stash', 'status']);
  });
  it('completes file names in argument position without trailing space', () => {
    expect(completeLine('git add ma', phrases, ['main.tf', 'README.md']).value).toBe('git add main.tf');
    expect(completeLine('cat RE', ['cat'], ['README.md']).value).toBe('cat README.md');
  });
  it('leaves unknown input alone', () => {
    expect(completeLine('zzz', phrases)).toEqual({ value: 'zzz', options: [] });
  });
});
