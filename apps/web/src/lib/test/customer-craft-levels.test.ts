// @vitest-environment node
/**
 * Grades every writing / decomposition / roleplay level in the customer-craft
 * formats: each solution/ must pass and each wrong/ must fail at least one
 * check. Checklists count as ticked, timers as met, and AI rubrics as skipped.
 */
import yaml from 'js-yaml';
import { readFile, readdir, stat } from 'node:fs/promises';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import type { Check } from '@fde/content-schema';
import { gradeWritingOffline } from '../writing-grader';
import { gradeRoleplayLevel, parsePersona, parseTranscript, replayTranscript } from '../roleplay-engine';

interface Level {
  id: string;
  type: string;
  environment: string;
  module: string;
  checks: Check[];
  hints: string[];
  unlocks?: string[];
  starter_files?: { path: string; content?: string; from?: string }[];
}

const contentRoot = resolve(process.cwd(), '../../content');
const ROOTS = ['phases/phase-4-customer', 'phases/phase-5-capstone', 'phases/phase-6-interview', 'phases/phase-2-cloud/week-09'];

async function isDir(path: string): Promise<boolean> {
  try { return (await stat(path)).isDirectory(); } catch { return false; }
}

async function findLevelDirs(dir: string): Promise<string[]> {
  if (!(await isDir(dir))) return [];
  const found: string[] = [];
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const path = resolve(dir, entry.name);
    try { await stat(resolve(path, 'level.yaml')); found.push(path); } catch { found.push(...await findLevelDirs(path)); }
  }
  return found;
}

async function readFiles(dir: string): Promise<Record<string, string>> {
  const files: Record<string, string> = {};
  if (!(await isDir(dir))) return files;
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    if (entry.isFile()) files[entry.name] = await readFile(resolve(dir, entry.name), 'utf8');
  }
  return files;
}

async function starterFiles(folder: string, level: Level): Promise<Record<string, string>> {
  const files: Record<string, string> = {};
  for (const file of level.starter_files ?? []) {
    if (file.content !== undefined) files[file.path] = file.content;
    else {
      const source = file.from ? resolve(folder, file.from) : resolve(folder, 'starter', file.path);
      try { files[file.path] = await readFile(source, 'utf8'); } catch { files[file.path] = ''; }
    }
  }
  return files;
}

async function gradeAttempt(folder: string, level: Level, attemptDir: string) {
  const starters = await starterFiles(folder, level);
  const attempt = await readFiles(resolve(folder, attemptDir));
  if (level.environment === 'roleplay') {
    const persona = parsePersona(starters['persona.json'] ?? attempt['persona.json'] ?? '{}');
    const state = replayTranscript(persona, parseTranscript(attempt['transcript.txt'] ?? ''));
    const rest = { ...attempt };
    delete rest['transcript.txt'];
    return gradeRoleplayLevel(level.checks, state, { files: { ...starters, ...rest }, assumeChecklistTicked: true, ignoreTime: true, skipServerChecks: true, ai: null });
  }
  return gradeWritingOffline(level.checks, { ...starters, ...attempt });
}

const allDirs = (await Promise.all(ROOTS.map((root) => findLevelDirs(resolve(contentRoot, root))))).flat().sort();
const levels = await Promise.all(allDirs.map(async (folder) => ({ folder, level: yaml.load(await readFile(resolve(folder, 'level.yaml'), 'utf8')) as Level })));
const crafted = levels.filter(({ level }) => level.environment === 'writing' || level.environment === 'roleplay');

describe('customer-craft levels (writing, decomposition, roleplay)', () => {
  it('finds levels to grade when phase 4 content exists', async () => {
    if (await isDir(resolve(contentRoot, 'phases/phase-4-customer'))) expect(crafted.length).toBeGreaterThan(0);
  });

  for (const { folder, level } of crafted) {
    it(`${level.id}: solution passes and wrong fails`, async () => {
      expect(['writing', 'decomposition', 'roleplay']).toContain(level.type);
      expect(level.hints.length).toBeGreaterThanOrEqual(2);
      if (level.environment === 'roleplay') {
        const starters = await starterFiles(folder, level);
        expect(() => parsePersona(starters['persona.json'] ?? ''), `${level.id} persona.json`).not.toThrow();
      }
      const solution = await gradeAttempt(folder, level, 'solution');
      expect(solution.every((check) => check.passed), `${level.id} solution: ${JSON.stringify(solution.filter((check) => !check.passed))}`).toBe(true);
      const wrong = await gradeAttempt(folder, level, 'wrong');
      expect(wrong.some((check) => !check.passed), `${level.id} wrong example unexpectedly passed`).toBe(true);
    });
  }
});

describe('phase 4 quiz levels', () => {
  const quizzes = levels.filter(({ folder, level }) => folder.includes('phase-4-customer') && level.environment === 'quiz');
  for (const { level } of quizzes) {
    it(`${level.id}: every expected answer is one of the options`, () => {
      for (const check of level.checks) {
        expect(check.action).toBe('multiple_choice');
        expect((check.options as string[]).map(String)).toContain(String(check.expected));
      }
    });
  }
});

describe('phase 4 unlock chains', () => {
  it('chains levels within each week and links each week to the next; phase 4 ends with an empty list', () => {
    const phase4 = levels.filter(({ folder }) => folder.includes('phase-4-customer'));
    const ids = new Set(phase4.map(({ level }) => level.id));
    const byWeek = new Map<string, Level[]>();
    for (const { level } of phase4) {
      const week = level.id.slice(0, 6);
      byWeek.set(week, [...(byWeek.get(week) ?? []), level]);
    }
    const weekKeys = [...byWeek.keys()].sort();
    const sortedWeeks = weekKeys.map((key) => byWeek.get(key)!.sort((a, b) => a.id.localeCompare(b.id)));
    sortedWeeks.forEach((sorted, weekIndex) => {
      const nextWeekFirst = sortedWeeks[weekIndex + 1]?.[0];
      sorted.forEach((level, index) => {
        const next = sorted[index + 1] ?? nextWeekFirst;
        expect(level.unlocks ?? [], level.id).toEqual(next ? [next.id] : []);
        for (const target of level.unlocks ?? []) expect(ids.has(target)).toBe(true);
      });
    });
  });

  it('chains week 23 into week 24 and ends the interview loop with an empty list', () => {
    const phase6 = levels.filter(({ folder }) => folder.includes('phase-6-interview')).map(({ level }) => level);
    const w23 = phase6.filter((level) => level.id.startsWith('p6-w23')).sort((a, b) => a.id.localeCompare(b.id));
    const w24 = phase6.filter((level) => level.id.startsWith('p6-w24')).sort((a, b) => a.id.localeCompare(b.id));
    if (!w24.length) return;
    expect(w23.at(-1)!.unlocks ?? []).toEqual([w24[0]!.id]);
    w24.forEach((level, index) => expect(level.unlocks ?? [], level.id).toEqual(w24[index + 1] ? [w24[index + 1]!.id] : []));
  });
});
