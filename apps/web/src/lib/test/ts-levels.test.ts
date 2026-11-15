// @vitest-environment node
import * as esbuild from 'esbuild-wasm';
import yaml from 'js-yaml';
import { readFile, readdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { gradeTypeScriptLevel, type TypeScriptRunResult } from '../typescript-grader';

interface TsLevel { id: string; checks: Parameters<typeof gradeTypeScriptLevel>[0] }

const printable = (value: unknown): string => (typeof value === 'string' ? value : JSON.stringify(value));

async function run(source: string): Promise<TypeScriptRunResult> {
  const { code } = await esbuild.transform(source, { loader: 'ts', target: 'es2022', format: 'iife' });
  const logs: string[] = [];
  const tests: { name: string; fn: () => unknown }[] = [];
  const console = { log: (...v: unknown[]) => logs.push(v.map(printable).join(' ')), info: (...v: unknown[]) => logs.push(v.map(printable).join(' ')) };
  const expect = (actual: unknown) => ({
    toBe: (e: unknown) => { if (!Object.is(actual, e)) throw new Error(`Expected ${printable(actual)} to be ${printable(e)}`); },
    toEqual: (e: unknown) => { if (JSON.stringify(actual) !== JSON.stringify(e)) throw new Error(`Expected ${printable(actual)} to equal ${printable(e)}`); },
    toContain: (e: unknown) => {
      const ok = typeof actual === 'string' ? typeof e === 'string' && actual.includes(e) : Array.isArray(actual) && actual.includes(e);
      if (!ok) throw new Error('missing');
    },
    toBeTruthy: () => { if (!actual) throw new Error('falsy'); },
  });
  try {
    // Mirrors the in-browser TS runner, which also evaluates the compiled level code.
    // eslint-disable-next-line @typescript-eslint/no-implied-eval -- deliberate eval of compiled level code in a test
    const runLevel = new Function('console', 'test', 'expect', code) as (c: typeof console, t: (name: string, fn: () => unknown) => void, x: typeof expect) => void;
    runLevel(console, (name: string, fn: () => unknown) => { tests.push({ name, fn }); }, expect);
    let passed = 0; let failed = 0;
    for (const item of tests) {
      try { await item.fn(); logs.push(`ok ${item.name}`); passed += 1; } catch (error) { logs.push(`x ${item.name}: ${(error as Error).message}`); failed += 1; }
    }
    return { stdout: logs.join('\n'), stderr: '', passed, failed, preview: '' };
  } catch (error) {
    return { stdout: logs.join('\n'), stderr: String(error), passed: 0, failed: 1, preview: '' };
  }
}

describe('Week 5 TypeScript curriculum', () => {
  it('passes every reference solution and fails every wrong attempt', async () => {
    const weekDir = resolve(process.cwd(), '../../content/phases/phase-1-backend/week-05/levels');
    const dirs = (await readdir(weekDir, { withFileTypes: true })).filter((e) => e.isDirectory() && e.name.startsWith('p1-w05-ts-')).map((e) => e.name).sort();
    expect(dirs.length).toBeGreaterThanOrEqual(15);
    for (const id of dirs) {
      const dir = resolve(weekDir, id);
      const level = yaml.load(await readFile(resolve(dir, 'level.yaml'), 'utf8')) as TsLevel;
      let solution: string;
      try { solution = await readFile(resolve(dir, 'solution/main.ts'), 'utf8'); } catch { continue; } // original levels have prose-only solutions
      const good = await run(solution);
      const goodChecks = gradeTypeScriptLevel(level.checks, { 'main.ts': solution }, good);
      expect(goodChecks.every((c) => c.passed), `${id} solution: ${JSON.stringify(goodChecks)} ${good.stderr}`).toBe(true);
      const wrongSrc = await readFile(resolve(dir, 'wrong/main.ts'), 'utf8');
      const bad = await run(wrongSrc);
      const badChecks = gradeTypeScriptLevel(level.checks, { 'main.ts': wrongSrc }, bad);
      expect(badChecks.some((c) => !c.passed), `${id} wrong attempt should fail`).toBe(true);
    }
  }, 30_000);
});
