// @vitest-environment node
import yaml from 'js-yaml';
import { existsSync } from 'node:fs';
import { readFile, readdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { validateLevel } from '@fde/content-schema';
import { gradeAiLevel, validateJsonSchema } from '../ai-grader';
import type { LevelMeta } from '../content-loader';

const phaseDir = resolve(process.cwd(), '../../content/phases/phase-3-ai');

async function aiLevelDirs(): Promise<string[]> {
  const dirs: string[] = [];
  for (const week of ['week-10', 'week-11', 'week-12']) {
    const levelsDir = resolve(phaseDir, week, 'levels');
    if (!existsSync(levelsDir)) continue;
    for (const entry of await readdir(levelsDir, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue;
      const dir = resolve(levelsDir, entry.name);
      const level = yaml.load(await readFile(resolve(dir, 'level.yaml'), 'utf8')) as LevelMeta;
      if (level.environment === 'ai') dirs.push(dir);
    }
  }
  return dirs.sort();
}

async function filesFor(dir: string, level: LevelMeta, overlay: 'solution' | 'wrong'): Promise<Record<string, string>> {
  const files: Record<string, string> = {};
  for (const file of level.starter_files ?? []) files[file.path] = file.content ?? '';
  for (const name of await readdir(resolve(dir, overlay))) files[name] = await readFile(resolve(dir, overlay, name), 'utf8');
  return files;
}

describe('AI workspace levels (weeks 10-12)', () => {
  it('passes every reference solution and fails every wrong one without an API key', async () => {
    const dirs = await aiLevelDirs();
    expect(dirs.length).toBeGreaterThanOrEqual(2);
    for (const dir of dirs) {
      const raw = yaml.load(await readFile(resolve(dir, 'level.yaml'), 'utf8'));
      const validation = validateLevel(raw);
      expect(validation.success, `${dir}: ${JSON.stringify(validation)}`).toBe(true);
      const level = raw as LevelMeta;
      expect(level.type).toBe('code');
      const solution = gradeAiLevel(level.checks, await filesFor(dir, level, 'solution'));
      expect(solution.every((result) => result.passed), `${level.id} solution: ${JSON.stringify(solution.filter((result) => !result.passed))}`).toBe(true);
      const wrong = gradeAiLevel(level.checks, await filesFor(dir, level, 'wrong'));
      expect(wrong.some((result) => !result.passed), `${level.id} wrong passed every check`).toBe(true);
      const starterFiles = Object.fromEntries((level.starter_files ?? []).map((file) => [file.path, file.content ?? '']));
      const starter = gradeAiLevel(level.checks, starterFiles);
      expect(starter.some((result) => !result.passed), `${level.id} starter already passes`).toBe(true);
    }
  });
});

describe('AI grader', () => {
  it('reports invalid JSON instead of throwing', () => {
    const [result] = gradeAiLevel([{ kind: 'sim_state', file: 'prompt.json', path: 'temperature', op: 'lte', expected: 0.3 }], { 'prompt.json': '{ "temperature": 0.2, }' });
    expect(result?.passed).toBe(false);
    expect(result?.actual).toMatch(/not valid JSON/);
  });

  it('flags required keys that are missing from properties', () => {
    expect(validateJsonSchema({ type: 'object', properties: { a: { type: 'string' } }, required: ['a', 'b'] })).toEqual(['$.required lists "b" but it is not in properties']);
    expect(validateJsonSchema({ type: 'object', properties: { a: { type: 'text' } } })).toHaveLength(1);
  });

  it('supports file_contains with regex and json_equals with a pointer', () => {
    const files = { 'prompt.json': '{"system": "Answer GST questions", "nested": {"k": [1, 2]}}' };
    const results = gradeAiLevel([
      { kind: 'file_contains', path: 'prompt.json', expected: 'gst', is_regex: true, ignore_case: true },
      { kind: 'json_equals', path: 'prompt.json', pointer: 'nested.k', expected: [1, 2] },
      { kind: 'sim_state', file: 'prompt.json', path: 'nested.k.length', op: 'eq', expected: 2 },
    ], files);
    expect(results.map((result) => result.passed)).toEqual([true, true, true]);
  });
});
