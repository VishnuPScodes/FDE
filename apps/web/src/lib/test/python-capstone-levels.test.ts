// @vitest-environment node
import yaml from 'js-yaml';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

// Runs every python level in phase 5 (capstone, weeks 20-22) and phase 6 (interview, weeks 23-24)
// with a real python + pytest: the solution must pass its checks, and the wrong attempt must fail one.
const contentDir = resolve(process.cwd(), '../../content/phases');
const weeks = [
  'phase-5-capstone/week-20',
  'phase-5-capstone/week-21',
  'phase-5-capstone/week-22',
  'phase-6-interview/week-23',
  'phase-6-interview/week-24',
];
const python = process.env.FDE_PYTHON ?? 'python3';
const hasPytest = spawnSync(python, ['-m', 'pytest', '--version']).status === 0;

interface Level { id: string; environment?: string; starter_files?: { path: string; content?: string }[]; checks: { kind: string; run?: string }[] }

function pythonLevels(): { dir: string; level: Level }[] {
  const out: { dir: string; level: Level }[] = [];
  for (const week of weeks) {
    const levelsDir = resolve(contentDir, week, 'levels');
    if (!existsSync(levelsDir)) continue;
    for (const name of readdirSync(levelsDir).sort()) {
      const dir = resolve(levelsDir, name);
      const file = resolve(dir, 'level.yaml');
      if (!existsSync(file)) continue;
      const level = yaml.load(readFileSync(file, 'utf8')) as Level;
      if (level.environment === 'python') out.push({ dir, level });
    }
  }
  return out;
}

function runChecks(dir: string, level: Level, overlay: 'solution' | 'wrong'): boolean {
  const work = mkdtempSync(resolve(tmpdir(), 'fde-py-'));
  try {
    for (const file of level.starter_files ?? []) writeFileSync(resolve(work, file.path), file.content ?? '');
    for (const name of readdirSync(resolve(dir, overlay))) writeFileSync(resolve(work, name), readFileSync(resolve(dir, overlay, name)));
    return level.checks.every((check) => {
      const command = check.run ?? 'python main.py';
      const args = command.startsWith('pytest')
        ? ['-m', 'pytest', '-p', 'no:cacheprovider', ...command.split(/\s+/).slice(1)]
        : command.split(/\s+/).slice(1);
      const result = spawnSync(python, args, { cwd: work, encoding: 'utf8', timeout: 60_000, env: { ...process.env, PYTHONDONTWRITEBYTECODE: '1' } });
      return result.status === 0;
    });
  } finally {
    rmSync(work, { recursive: true, force: true });
  }
}

describe.skipIf(!hasPytest)('python capstone + interview levels (weeks 20-24)', () => {
  const levels = pythonLevels();
  it('finds levels', () => expect(levels.length).toBeGreaterThan(10));
  for (const { dir, level } of levels) {
    it(`${level.id}: solution passes, wrong fails`, () => {
      expect(runChecks(dir, level, 'solution'), 'solution should pass').toBe(true);
      expect(runChecks(dir, level, 'wrong'), 'wrong should fail').toBe(false);
    }, 120_000);
  }
});
