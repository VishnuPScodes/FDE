import { describe, expect, it } from 'vitest';
import { loadLesson, loadLevel, loadSolutionFiles, loadStarterFile } from '../content-loader';

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

describe('Week 6 ETL content', () => {
  it('loads the capstone level, lesson, and workspace starter files', async () => {
    const level = await loadLevel('p1-w06-etl-015');
    const lesson = await loadLesson('phases/phase-1-backend/week-06/lessons/05-project-a-integration-service.md');
    expect(level.title).toContain('Project A');
    expect(level.checks[0]?.kind).toBe('pytest_passes');
    expect(lesson).toContain('enterprise integration service');
    expect(level.starter_files?.map((file) => file.path)).toEqual(['main.py', 'test_main.py', 'README.md', 'incoming/customers.csv']);
    const solution = await loadSolutionFiles(level.id, ['main.py']);
    expect(solution['main.py']).toContain('def run_etl');
  });
});
