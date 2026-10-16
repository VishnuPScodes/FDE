#!/usr/bin/env node
import { validateContent } from '../content-validator';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';

const defaultPath = [resolve('content'), resolve('../../content')].find((candidate) => existsSync(candidate)) ?? resolve('content');
const path = resolve(process.argv[2] ?? defaultPath);
const report = await validateContent(path);
for (const info of report.info) console.log(`INFO ${info}`);
for (const warning of report.warnings) console.warn(`WARN ${warning}`);
for (const error of report.errors) console.error(`ERROR ${error}`);
if (report.errors.length) {
  console.error(`Content validation failed with ${String(report.errors.length)} error(s).`);
  process.exitCode = 1;
} else {
  console.log(`Content validation passed (${path}).`);
}
