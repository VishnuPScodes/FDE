import yaml from 'js-yaml';
import { readFile, readdir, stat } from 'node:fs/promises';
import { dirname, join, relative, resolve, sep } from 'node:path';
import { validateCurriculum, validateLevel } from './validator';
import { lintLesson } from './style-linter';
import type { Curriculum, Level } from './schemas';

export interface ContentValidationReport { errors: string[]; warnings: string[]; info: string[] }

/** Validate content files, references, unlock edges, and lesson style under a content directory. */
export async function validateContent(contentDir = 'content'): Promise<ContentValidationReport> {
  const root = resolve(contentDir);
  const report: ContentValidationReport = { errors: [], warnings: [], info: [] };
  let curriculum: Curriculum;
  try {
    const parsed = validateCurriculum(yaml.load(await readFile(join(root, 'curriculum.yaml'), 'utf8')));
    if (!parsed.success) {
      report.errors.push(...parsed.errors.map((error) => `curriculum.yaml: ${error}`));
      return report;
    }
    curriculum = parsed.data;
  } catch (error) {
    report.errors.push(`curriculum.yaml: ${(error as Error).message}`);
    return report;
  }

  const files = await findFiles(root, 'level.yaml');
  const levels = new Map<string, { data: Level; file: string }>();
  for (const file of files) {
    const label = relative(root, file).split(sep).join('/');
    try {
      const parsed = validateLevel(yaml.load(await readFile(file, 'utf8')));
      if (!parsed.success) {
        report.errors.push(...parsed.errors.map((error) => `${label}: ${error}`));
        continue;
      }
      if (levels.has(parsed.data.id)) report.errors.push(`${label}: duplicate level id "${parsed.data.id}"`);
      else levels.set(parsed.data.id, { data: parsed.data, file });
    } catch (error) {
      report.errors.push(`${label}: ${(error as Error).message}`);
    }
  }

  const edges = new Map<string, string[]>();
  const lintedLessons = new Set<string>();
  for (const [id, { data, file }] of levels) {
    const directory = dirname(file);
    for (const ref of [data.lesson, data.solution, ...(data.starter_files ?? []).map((item) => item.from)]) {
      if (!ref) continue;
      const target = resolve(directory, ref);
      if (!target.startsWith(`${root}${sep}`) || !(await exists(target))) {
        report.errors.push(`${relative(root, file).split(sep).join('/')}: referenced file does not exist or escapes content/: ${ref}`);
      }
    }
    for (const requiredDir of [data.solution ?? 'solution/', 'wrong/']) {
      const target = resolve(directory, requiredDir);
      try {
        if (!(await stat(target)).isDirectory()) throw new Error('not a directory');
      } catch {
        report.errors.push(`${relative(root, file).split(sep).join('/')}: required ${requiredDir} directory is missing`);
      }
    }
    if (data.lesson) {
      const lessonPath = resolve(directory, data.lesson);
      if (lessonPath.startsWith(`${root}${sep}`) && !lintedLessons.has(lessonPath) && await exists(lessonPath)) {
        lintedLessons.add(lessonPath);
        const lint = lintLesson(await readFile(lessonPath, 'utf8'), relative(root, lessonPath).split(sep).join('/'));
        report.info.push(`${relative(root, lessonPath).split(sep).join('/')}: estimated reading level ${String(lint.readingLevel)} (Flesch-Kincaid grade; target 8 or below).`);
        report.warnings.push(...lint.warnings.map((warning) => warning.message));
      }
    }
    edges.set(id, data.unlocks ?? []);
  }
  for (const [id, targets] of edges) {
    for (const target of targets) if (!levels.has(target)) report.errors.push(`${id}: unlock target "${target}" does not exist`);
  }

  const visiting = new Set<string>();
  const visited = new Set<string>();
  const visit = (id: string): void => {
    if (visiting.has(id)) { report.errors.push(`unlock graph contains a cycle at "${id}"`); return; }
    if (visited.has(id)) return;
    visiting.add(id);
    for (const next of edges.get(id) ?? []) if (edges.has(next)) visit(next);
    visiting.delete(id);
    visited.add(id);
  };
  for (const id of edges.keys()) visit(id);

  const modules = new Set(curriculum.phases.flatMap((phase) => phase.weeks.flatMap((week) => week.modules)));
  for (const { data, file } of levels.values()) {
    if (!modules.has(data.module)) report.errors.push(`${relative(root, file).split(sep).join('/')}: module "${data.module}" is not listed in curriculum.yaml`);
  }
  return report;
}

async function findFiles(root: string, name: string): Promise<string[]> {
  const result: string[] = [];
  for (const entry of await readdir(root, { withFileTypes: true })) {
    const path = join(root, entry.name);
    if (entry.isDirectory()) result.push(...await findFiles(path, name));
    else if (entry.name === name) result.push(path);
  }
  return result;
}

async function exists(path: string): Promise<boolean> {
  try { await stat(path); return true; } catch { return false; }
}
