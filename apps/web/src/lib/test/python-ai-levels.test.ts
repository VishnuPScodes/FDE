// @vitest-environment node
import yaml from 'js-yaml';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

// Runs every python level in phase 3 weeks 10-15 with a real python3 + pytest:
// the solution must pass its pytest checks, and the wrong attempt must fail at least one.
const phaseDir = resolve(process.cwd(), '../../content/phases/phase-3-ai');
const python = process.env.FDE_PYTHON ?? 'python3';
const hasPytest = spawnSync(python, ['-m', 'pytest', '--version']).status === 0;

interface Level { id: string; environment?: string; starter_files?: { path: string; content?: string }[]; checks: { kind: string; run?: string }[] }

function pythonLevels(): { dir: string; level: Level }[] {
  const out: { dir: string; level: Level }[] = [];
  for (const week of ['week-10', 'week-11', 'week-12', 'week-13', 'week-14', 'week-15']) {
    const levelsDir = resolve(phaseDir, week, 'levels');
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
    // Starter files are inline (`content`) or path-only, read from the level's starter/ folder (week 13).
    for (const file of level.starter_files ?? []) {
      const fromDir = resolve(dir, 'starter', file.path);
      writeFileSync(resolve(work, file.path), file.content ?? (existsSync(fromDir) ? readFileSync(fromDir) : ''));
    }
    for (const name of readdirSync(resolve(dir, overlay))) writeFileSync(resolve(work, name), readFileSync(resolve(dir, overlay, name)));
    return level.checks.every((check) => {
      const command = check.run ?? 'python main.py';
      const args = command.startsWith('pytest') ? ['-m', 'pytest', ...command.split(/\s+/).slice(1)] : command.split(/\s+/).slice(1);
      const result = spawnSync(python, args, { cwd: work, encoding: 'utf8', timeout: 60_000, env: { ...process.env, PYTHONDONTWRITEBYTECODE: '1' } });
      return result.status === 0;
    });
  } finally {
    rmSync(work, { recursive: true, force: true });
  }
}

describe.skipIf(!hasPytest)('python AI levels (weeks 10-15)', () => {
  const levels = pythonLevels();
  it('finds levels', () => expect(levels.length).toBeGreaterThan(40));
  for (const { dir, level } of levels) {
    it(`${level.id}: solution passes, wrong fails`, () => {
      expect(runChecks(dir, level, 'solution'), 'solution should pass').toBe(true);
      expect(runChecks(dir, level, 'wrong'), 'wrong should fail').toBe(false);
    }, 120_000);
  }
});
