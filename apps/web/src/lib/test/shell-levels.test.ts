// @vitest-environment node
import yaml from 'js-yaml';
import { readFile, readdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { gradeShellLevel } from '../shell-grader';
import { createShellState, runShellCommand } from '../shell-runtime';

interface ShellLevel {
  id: string;
  checks: Parameters<typeof gradeShellLevel>[0];
  starter_files?: { path: string; content?: string }[];
}

async function evaluateScript(level: ShellLevel, source: string) {
  const files = Object.fromEntries(
    (level.starter_files ?? []).map((file) => [`/workspace/${file.path}`, file.content ?? '']),
  );
  let state = createShellState(files);
  for (const command of source
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)) {
    state = runShellCommand(state, command).state;
  }
  return gradeShellLevel(level.checks, state);
}

describe('Week 1 shell curriculum', () => {
  it('passes each reference script and rejects each wrong script', async () => {
    const levelsDir = resolve(
      process.cwd(),
      '../../content/phases/phase-0-foundations/week-01/levels',
    );
    const levelIds = (await readdir(levelsDir)).filter((id) => id.startsWith('p0-w01-sh-')).sort();
    expect(levelIds).toHaveLength(6);
    for (const id of levelIds) {
      const folder = resolve(levelsDir, id);
      const level = yaml.load(await readFile(resolve(folder, 'level.yaml'), 'utf8')) as ShellLevel;
      const solution = await readFile(resolve(folder, 'solution/main.sh'), 'utf8');
      const solutionResults = await evaluateScript(level, solution);
      expect(
        solutionResults.every((result) => result.passed),
        `${id} solution: ${JSON.stringify(solutionResults)}`,
      ).toBe(true);

      const wrong = await readFile(resolve(folder, 'wrong/main.sh'), 'utf8');
      const wrongResults = await evaluateScript(level, wrong);
      expect(
        wrongResults.some((result) => !result.passed),
        `${id} wrong example unexpectedly passed`,
      ).toBe(true);
    }
  });
});
