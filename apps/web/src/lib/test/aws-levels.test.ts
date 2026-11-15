// @vitest-environment node
import yaml from 'js-yaml';
import { existsSync } from 'node:fs';
import { readFile, readdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import type { Check } from '@fde/content-schema';
import { gradeAwsLevel } from '../aws-grader';
import { createLevelState, runAwsCommand } from '../aws/run';

interface Level {
  id: string;
  environment: string;
  checks: Check[];
  hints: string[];
  unlocks?: string[];
  starter_files?: { path: string; content?: string }[];
}

const levelsDir = resolve(process.cwd(), '../../content/phases/phase-2-cloud/week-08/levels');

async function awsLevels(): Promise<{ dir: string; level: Level }[]> {
  if (!existsSync(levelsDir)) return [];
  const found: { dir: string; level: Level }[] = [];
  for (const entry of (await readdir(levelsDir, { withFileTypes: true })).filter((item) => item.isDirectory()).sort((a, b) => a.name.localeCompare(b.name))) {
    const dir = resolve(levelsDir, entry.name);
    const level = yaml.load(await readFile(resolve(dir, 'level.yaml'), 'utf8')) as Level;
    if (level.environment === 'aws') found.push({ dir, level });
  }
  return found;
}

async function replay(dir: string, level: Level, overlay: 'solution' | 'wrong') {
  let state = createLevelState(Object.fromEntries((level.starter_files ?? []).map((file) => [file.path, file.content ?? ''])));
  const lines = (await readFile(resolve(dir, overlay, 'commands.txt'), 'utf8')).split('\n').map((line) => line.trim()).filter((line) => line && !line.startsWith('#'));
  const failures: string[] = [];
  for (const line of lines) {
    const result = runAwsCommand(state, line);
    if (result.exitCode !== 0) failures.push(`${line}\n${result.stderr}`);
    state = result.state;
  }
  return { state, failures };
}

describe('Week 8 AWS levels', () => {
  it('has the aws-core levels', async () => {
    const levels = await awsLevels();
    expect(levels.length).toBeGreaterThanOrEqual(6);
  });

  it('passes every check with the reference solution, and every solution command succeeds', async () => {
    for (const { dir, level } of await awsLevels()) {
      const { state, failures } = await replay(dir, level, 'solution');
      expect(failures, level.id).toEqual([]);
      const results = gradeAwsLevel(level.checks, state);
      expect(results.filter((check) => !check.passed), level.id).toEqual([]);
    }
  });

  it('fails at least one check with the wrong attempt', async () => {
    for (const { dir, level } of await awsLevels()) {
      const { state } = await replay(dir, level, 'wrong');
      expect(gradeAwsLevel(level.checks, state).some((check) => !check.passed), level.id).toBe(true);
    }
  });

  it('fails a fresh level, has at least two hints, and chains unlocks', async () => {
    const levels = await awsLevels();
    for (const [index, { level }] of levels.entries()) {
      const fresh = createLevelState(Object.fromEntries((level.starter_files ?? []).map((file) => [file.path, file.content ?? ''])));
      expect(gradeAwsLevel(level.checks, fresh).some((check) => !check.passed), level.id).toBe(true);
      expect(level.hints.length).toBeGreaterThanOrEqual(2);
      expect(level.unlocks?.[0]).toBe(index === levels.length - 1 ? 'p2-w08-tf-001' : levels[index + 1]!.level.id);
    }
  });
});

describe('AWS command runner', () => {
  it('keeps shell variables and rejects unknown programs', () => {
    let state = createLevelState();
    state = runAwsCommand(state, 'VPC=$(aws ec2 create-vpc --cidr-block 10.1.0.0/16 --query Vpc.VpcId --output text)').state;
    const result = runAwsCommand(state, 'aws ec2 describe-vpcs --vpc-ids $VPC --query Vpcs[0].CidrBlock --output text');
    expect(result.stdout.trim()).toBe('10.1.0.0/16');
    expect(runAwsCommand(state, 'kubectl get pods').exitCode).toBe(127);
  });
});
