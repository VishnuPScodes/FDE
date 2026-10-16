import { describe, expect, it } from 'vitest';
import { loadStarterFile } from '../content-loader';

describe('bundled SQL fixtures', () => {
  it('resolves a starter setup file shared from content/shared', async () => {
    const setup = await loadStarterFile(
      'p0-w02-sql-001',
      'setup.sql',
      '../../../../../shared/sql/week-02.sql',
    );
    expect(setup).toContain('CREATE TABLE customers');
    expect(setup).toContain('generate_series(1, 5000)');
  });
});
