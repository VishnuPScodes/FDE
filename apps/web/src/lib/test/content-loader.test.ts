import { describe, expect, it } from 'vitest';
import { loadLesson, loadStarterFile } from '../content-loader';

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

describe('bundled lessons', () => {
  it('loads raw Markdown lesson modules from the content workspace', async () => {
    const lesson = await loadLesson(
      'phases/phase-0-foundations/week-02/lessons/02-filters-and-null.md',
    );
    expect(lesson).toContain('NULL');
    expect(lesson).toContain('filter');
  });
});
