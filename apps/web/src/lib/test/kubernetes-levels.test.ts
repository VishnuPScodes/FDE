// @vitest-environment node
import yaml from 'js-yaml';
import { existsSync } from 'node:fs';
import { readFile, readdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import type { Check } from '@fde/content-schema';
import { createCluster } from '../kubernetes/controller';
import { runKubectl } from '../kubernetes/kubectl';
import { gradeKubernetesLevel as grade } from '../kubernetes-grader';

interface Level {
  id: string;
  environment: string;
  checks: Check[];
  hints: string[];
  unlocks?: string[];
  starter_files?: { path: string; content?: string }[];
}

const levelsDir = resolve(process.cwd(), '../../content/phases/phase-2-cloud/week-08/levels');

async function levels(): Promise<{ dir: string; level: Level }[]> {
  if (!existsSync(levelsDir)) return [];
  const found: { dir: string; level: Level }[] = [];
  for (const entry of (await readdir(levelsDir, { withFileTypes: true })).filter((item) => item.isDirectory() && item.name.startsWith('p2-w08-k8s-')).sort((a, b) => a.name.localeCompare(b.name))) {
    const dir = resolve(levelsDir, entry.name);
    found.push({ dir, level: yaml.load(await readFile(resolve(dir, 'level.yaml'), 'utf8')) as Level });
  }
  return found;
}

async function play(dir: string, level: Level, overlay: 'solution' | 'wrong') {
  const files: Record<string, string> = Object.fromEntries((level.starter_files ?? []).map((file) => [file.path, file.content ?? '']));
  for (const name of await readdir(resolve(dir, overlay))) if (name !== 'session.txt') files[name] = await readFile(resolve(dir, overlay, name), 'utf8');
  let state = createCluster(files);
  const session = (await readFile(resolve(dir, overlay, 'session.txt'), 'utf8')).split('\n').filter(Boolean);
  for (const line of session) state = runKubectl(state, line).state;
  return grade(level.checks, state);
}

describe('Week 8 Kubernetes levels', () => {
  it('has six levels with hints, the right environment and a chained unlock', async () => {
    const found = await levels();
    expect(found.map((item) => item.level.id)).toEqual([1, 2, 3, 4, 5, 6].map((n) => `p2-w08-k8s-00${n}`));
    found.forEach(({ level }, index) => {
      expect(level.environment).toBe('kubernetes');
      expect(level.hints.length, level.id).toBeGreaterThanOrEqual(2);
      expect(level.unlocks, level.id).toEqual([index === 5 ? 'p2-w09-obs-001' : `p2-w08-k8s-00${index + 2}`]);
    });
  });

  it('passes every reference solution and fails every wrong attempt', async () => {
    for (const { dir, level } of await levels()) {
      const solution = await play(dir, level, 'solution');
      expect(solution.every((result) => result.passed), `${level.id} solution: ${JSON.stringify(solution.filter((result) => !result.passed))}`).toBe(true);
      const wrong = await play(dir, level, 'wrong');
      expect(wrong.some((result) => !result.passed), `${level.id} wrong attempt should fail`).toBe(true);
    }
  }, 60_000);

  it('does not pass from the untouched starter files', async () => {
    for (const { level } of await levels()) {
      const files = Object.fromEntries((level.starter_files ?? []).map((file) => [file.path, file.content ?? '']));
      expect(grade(level.checks, createCluster(files)).some((result) => !result.passed), level.id).toBe(true);
    }
  });
});
