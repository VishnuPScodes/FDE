// @vitest-environment node
import yaml from 'js-yaml';
import { existsSync } from 'node:fs';
import { readFile, readdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import type { Check } from '@fde/content-schema';
import { ALERT_FILE, gradeObservabilityLevel, parseScenarioConfig, replaySession } from '../observability';

interface Level {
  id: string;
  environment: string;
  checks: Check[];
  hints: string[];
  starter_files?: { path: string; content?: string }[];
}

type Session = Parameters<typeof replaySession>[1];

const levelsDir = resolve(process.cwd(), '../../content/phases/phase-2-cloud/week-09/levels');

async function observabilityLevels(): Promise<{ dir: string; level: Level }[]> {
  if (!existsSync(levelsDir)) return [];
  const found: { dir: string; level: Level }[] = [];
  for (const entry of (await readdir(levelsDir, { withFileTypes: true })).filter((item) => item.isDirectory()).sort((a, b) => a.name.localeCompare(b.name))) {
    const dir = resolve(levelsDir, entry.name);
    const level = yaml.load(await readFile(resolve(dir, 'level.yaml'), 'utf8')) as Level;
    if (level.environment === 'observability') found.push({ dir, level });
  }
  return found;
}

async function grade(dir: string, level: Level, overlay: 'solution' | 'wrong') {
  const starter = Object.fromEntries((level.starter_files ?? []).map((file) => [file.path, file.content ?? '']));
  const session = JSON.parse(await readFile(resolve(dir, overlay, 'session.json'), 'utf8')) as Session;
  const state = replaySession(parseScenarioConfig(starter), { alertRule: starter[ALERT_FILE] ?? '', ...session });
  return gradeObservabilityLevel(level.checks, state);
}

describe('Week 9 observability levels', () => {
  it('has observability levels with at least two hints each', async () => {
    const levels = await observabilityLevels();
    expect(levels.length).toBeGreaterThanOrEqual(8);
    for (const { level } of levels) expect(level.hints.length, level.id).toBeGreaterThanOrEqual(2);
  });

  it('passes every reference solution and fails every wrong attempt', async () => {
    for (const { dir, level } of await observabilityLevels()) {
      const solution = await grade(dir, level, 'solution');
      expect(solution.every((result) => result.passed), `${level.id} solution: ${JSON.stringify(solution.filter((result) => !result.passed))}`).toBe(true);
      const wrong = await grade(dir, level, 'wrong');
      expect(wrong.some((result) => !result.passed), `${level.id} wrong attempt should fail`).toBe(true);
    }
  }, 60_000);
});
