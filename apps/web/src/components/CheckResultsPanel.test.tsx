import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import CheckResultsPanel, { formatDuration } from './CheckResultsPanel';

const pass = [{ kind: 'x', label: 'Check one', passed: true, actual: '', expected: '' }];
const fail = [{ kind: 'x', label: 'Check one', passed: false, actual: 'a', expected: 'b' }];

describe('CheckResultsPanel pass banner', () => {
  it('shows time and attempts when passed', () => {
    render(<CheckResultsPanel results={pass} stats={{ attempts: 3, timeSec: 125 }} />);
    expect(screen.getByText('Level passed')).toBeTruthy();
    expect(screen.getByText('2m 05s · 3 attempts')).toBeTruthy();
  });
  it('hides the banner when a check fails', () => {
    render(<CheckResultsPanel results={fail} stats={{ attempts: 1, timeSec: 5 }} />);
    expect(screen.queryByText('Level passed')).toBeNull();
  });
  it('formats durations', () => {
    expect(formatDuration(45)).toBe('45s');
    expect(formatDuration(3700)).toBe('1h 01m');
  });
});
