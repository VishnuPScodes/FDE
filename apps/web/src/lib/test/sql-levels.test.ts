// @vitest-environment node
import { PGlite } from '@electric-sql/pglite';
import yaml from 'js-yaml';
import { readFile, readdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { gradeSqlLevel } from '../sql-grader';
import type { SqlQueryResult } from '../sql-runtime';

interface SqlLevel { id: string; checks: Parameters<typeof gradeSqlLevel>[0] }

describe('Week 2 SQL curriculum', () => {
  it('passes every reference query and rejects every wrong query in PGlite', async () => {
    const weekDir = resolve(process.cwd(), '../../content/phases/phase-0-foundations/week-02/levels');
    const sharedSetup = await readFile(resolve(process.cwd(), '../../content/shared/sql/week-02.sql'), 'utf8');
    const levelDirs = (await readdir(weekDir, { withFileTypes: true }))
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name)
      .sort();
    const database = await PGlite.create();
    try {
      expect(levelDirs).toHaveLength(15);
      for (const levelId of levelDirs) {
        const levelDir = resolve(weekDir, levelId);
        const level = yaml.load(await readFile(resolve(levelDir, 'level.yaml'), 'utf8')) as SqlLevel;
        await database.exec('DROP SCHEMA public CASCADE; CREATE SCHEMA public;');
        await database.exec(sharedSetup);
        const run = async (sql: string): Promise<SqlQueryResult> => {
          const statements = await database.exec(sql);
          const lastWithRows = [...statements].reverse().find((statement) => statement.rows !== undefined);
          const rows = (lastWithRows?.rows ?? []) as Record<string, unknown>[];
          const columns = lastWithRows?.fields?.map((field) => field.name) ?? [];
          return {
            columns,
            rows,
            rowCount: columns.length > 0 ? rows.length : (lastWithRows?.affectedRows ?? 0),
          };
        };
        const solution = await readFile(resolve(levelDir, 'solution/main.sql'), 'utf8');
        const solutionResults = await gradeSqlLevel(level.checks, solution, run);
        expect(solutionResults.every((result) => result.passed), `${level.id} reference query: ${JSON.stringify(solutionResults)}`).toBe(true);

        await database.exec('DROP SCHEMA public CASCADE; CREATE SCHEMA public;');
        await database.exec(sharedSetup);
        const wrong = await readFile(resolve(levelDir, 'wrong/main.sql'), 'utf8');
        const wrongResults = await gradeSqlLevel(level.checks, wrong, run);
        expect(wrongResults.every((result) => !result.passed), `${level.id} wrong query: ${JSON.stringify(wrongResults)}`).toBe(true);
      }
    } finally {
      await database.close();
    }
  }, 30_000);
});
