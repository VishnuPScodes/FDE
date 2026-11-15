import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import RuntimeProgress, { formatDownloadStatus } from './RuntimeProgress';

describe('RuntimeProgress', () => {
  it('formats status with percent when total known', () => {
    expect(formatDownloadStatus('Loading x', 50, 200)).toBe('Loading x · 25%');
    expect(formatDownloadStatus('Loading x', 5, 0)).toBe('Loading x…');
  });
  it('renders a determinate progressbar', () => {
    const html = renderToStaticMarkup(<RuntimeProgress label="Loading" percent={40} />);
    expect(html).toContain('aria-valuenow="40"');
  });
});
