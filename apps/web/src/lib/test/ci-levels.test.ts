// @vitest-environment node
import yaml from 'js-yaml';
import { readFile, readdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { gradeCiLevel } from '../ci-grader';
import { createCiState, runCiCommand } from '../ci-runtime';

interface CiLevel {
  id: string;
  checks: Parameters<typeof gradeCiLevel>[0];
  starter_files?: { path: string; content?: string }[];
}

async function readTree(dir: string, prefix = ''): Promise<Record<string, string>> {
  const files: Record<string, string> = {};
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const path = prefix + entry.name;
    if (entry.isDirectory()) Object.assign(files, await readTree(resolve(dir, entry.name), path + '/'));
    else files[path] = await readFile(resolve(dir, entry.name), 'utf8');
  }
  return files;
}

/** Overlays the attempt's files on the starter files, then replays its action list. */
async function evaluate(level: CiLevel, folder: string) {
  const attempt = await readTree(folder);
  const actions = (attempt['actions.txt'] ?? '').split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  delete attempt['actions.txt'];
  const files = { ...Object.fromEntries((level.starter_files ?? []).map((file) => [file.path, file.content ?? ''])), ...attempt };
  let state = createCiState(files);
  for (const action of actions) state = runCiCommand(state, action).state;
  return { results: gradeCiLevel(level.checks, state), state };
}

describe('Week 7 CI/CD curriculum', () => {
  it('passes each reference solution and rejects each wrong attempt', async () => {
    const levelsDir = resolve(process.cwd(), '../../content/phases/phase-2-cloud/week-07/levels');
    const ids = (await readdir(levelsDir)).filter((id) => id.startsWith('p2-w07-ci-')).sort();
    expect(ids).toHaveLength(10);
    for (const id of ids) {
      const folder = resolve(levelsDir, id);
      const level = yaml.load(await readFile(resolve(folder, 'level.yaml'), 'utf8')) as CiLevel;
      const solution = await evaluate(level, resolve(folder, 'solution'));
      expect(solution.results.every((result) => result.passed), `${id} solution: ${JSON.stringify(solution.results.filter((result) => !result.passed))}\n${solution.state.stdout}`).toBe(true);
      const wrong = await evaluate(level, resolve(folder, 'wrong'));
      expect(wrong.results.some((result) => !result.passed), `${id} wrong attempt unexpectedly passed`).toBe(true);
    }
  });

  it('reports invalid workflow files as failed runs', () => {
    const state = createCiState({ '.github/workflows/ci.yml': 'name: CI\non: push\njobs:\n  test:\n    steps:\n      - run: echo hi\n' });
    const result = runCiCommand(state, 'push main');
    expect(result.state.runs[0]?.conclusion).toBe('failure');
    expect(result.stdout).toContain('runs-on');
  });
});
