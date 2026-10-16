/**
 * Content loader — fetches curriculum.yaml, level.yaml, and lesson Markdown
 * from the CDN (or dev server in development).
 *
 * All content lives as static files under /content/ on the same origin.
 * No API calls needed — just fetch from CDN.
 */

import yaml from 'js-yaml';
import { validateCurriculum, validateLevel } from '@fde/content-schema';
import type { Check, FeedbackRule } from '@fde/content-schema';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface CurriculumPhase {
  id: number;
  title: string;
  weeks: CurriculumWeek[];
  project?: string;
}

export interface CurriculumWeek {
  week: number;
  title: string;
  modules: string[];
}

export interface Curriculum {
  version: string;
  phases: CurriculumPhase[];
}

export interface LevelMeta {
  id: string;
  title: string;
  phase: number;
  week: number;
  module: string;
  order: number;
  difficulty: number;
  estimated_minutes: number;
  type: string;
  environment: string;
  lesson?: string;
  task: string;
  starter_files?: { path: string; content?: string; from?: string }[];
  checks: Check[];
  hints: string[];
  feedback?: FeedbackRule[];
  solution?: string;
  unlocks?: string[];
  tags?: string[];
  mobile_compatible?: boolean;
  timed?: boolean;
}

// ─── Cache ────────────────────────────────────────────────────────────────────

let curriculumCache: Curriculum | null = null;
const levelCache = new Map<string, LevelMeta>();
const lessonCache = new Map<string, string>();

// ─── Loaders ──────────────────────────────────────────────────────────────────

const yamlFiles = import.meta.glob('../../../../content/**/*.yaml', { query: '?raw', import: 'default' }) as Record<string, () => Promise<string>>;
const markdownFiles = import.meta.glob('../../../../content/**/*.md', { query: '?raw', import: 'default' }) as Record<string, () => Promise<string>>;
const workspaceFiles = import.meta.glob('../../../../content/**/*.{py,csv,txt,json,sql}', { query: '?raw', import: 'default' }) as Record<string, () => Promise<string>>;

function findContentFile(files: Record<string, unknown>, suffix: string): string | undefined {
  return Object.keys(files).find((path) => path.endsWith(suffix));
}

/**
 * Load the curriculum.yaml file.
 * Cached after first load.
 */
export async function loadCurriculum(): Promise<Curriculum> {
  if (curriculumCache) return curriculumCache;

  const file = findContentFile(yamlFiles, '/content/curriculum.yaml');
  if (!file) throw new Error('curriculum.yaml is missing from bundled content.');
  const text = await yamlFiles[file]!();
  const parsed = validateCurriculum(yaml.load(text));
  if (!parsed.success) throw new Error(`Invalid curriculum: ${parsed.errors.join('; ')}`);
  const data = parsed.data;

  curriculumCache = data;
  return data;
}

/**
 * Load a level.yaml file by level ID.
 * Level IDs follow the pattern: p{phase}-w{week}-{topic}-{number}
 * e.g. p0-w01-py-001
 */
export async function loadLevel(levelId: string): Promise<LevelMeta> {
  const cached = levelCache.get(levelId);
  if (cached) return cached;

  const file = findContentFile(yamlFiles, `/levels/${levelId}/level.yaml`);
  if (!file) throw new Error(`Level ${levelId} was not found in bundled content.`);
  const text = await yamlFiles[file]!();
  const parsed = validateLevel(yaml.load(text));
  if (!parsed.success) throw new Error(`Invalid level ${levelId}: ${parsed.errors.join('; ')}`);
  const data = parsed.data as LevelMeta;

  levelCache.set(levelId, data);
  return data;
}

/**
 * Load a lesson Markdown file.
 * Path is relative to the content directory.
 */
export async function loadLesson(lessonPath: string): Promise<string> {
  const cached = lessonCache.get(lessonPath);
  if (cached) return cached;

  // Normalize path — remove leading ./
  const normalized = lessonPath.replace(/^\.\//, '').replace(/^\//, '');
  const file = findContentFile(markdownFiles, `/${normalized}`);
  if (!file) throw new Error(`Lesson ${normalized} was not found in bundled content.`);
  const text = await markdownFiles[file]!();
  lessonCache.set(lessonPath, text);
  return text;
}

/**
 * Load a starter file for a level.
 */
export async function loadStarterFile(levelId: string, filePath: string, from?: string): Promise<string> {
  const suffix = from ? resolveContentReference(levelIdToPath(levelId), from) : `${levelIdToPath(levelId)}/starter/${filePath}`;
  const file = findContentFile(workspaceFiles, `/${suffix}`);
  return file ? workspaceFiles[file]!() : '';
}

function resolveContentReference(basePath: string, reference: string): string {
  const segments = basePath.split('/');
  for (const segment of reference.replaceAll('\\', '/').split('/')) {
    if (!segment || segment === '.') continue;
    if (segment === '..') segments.pop();
    else segments.push(segment);
  }
  return segments.join('/');
}

export async function loadSolutionFiles(levelId: string, filePaths: string[]): Promise<Record<string, string>> {
  const result: Record<string, string> = {};
  for (const filePath of filePaths) {
    const suffix = `/levels/${levelId}/solution/${filePath}`;
    const file = findContentFile(workspaceFiles, suffix);
    if (!file) throw new Error(`Solution file ${filePath} is not available.`);
    result[filePath] = await workspaceFiles[file]!();
  }
  return result;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Convert a level ID like "p0-w01-py-001" to its directory path.
 * → phases/phase-0-foundations/week-01/levels/p0-w01-py-001
 *
 * We use a simplified mapping since phase names are in the directory structure.
 */
const PHASE_NAMES: Record<number, string> = {
  0: 'phase-0-foundations',
  1: 'phase-1-backend',
  2: 'phase-2-cloud',
  3: 'phase-3-ai',
  4: 'phase-4-customer',
  5: 'phase-5-capstone',
  6: 'phase-6-interview',
};

export function levelIdToPath(levelId: string): string {
  // Parse: p{phase}-w{week}-{topic}-{number}
  const match = levelId.match(/^p(\d)-w(\d{2})-/);
  if (!match) throw new Error(`Invalid level ID format: ${levelId}`);

  const phase = parseInt(match[1]!, 10);
  const week = match[2]!;
  const phaseName = PHASE_NAMES[phase] ?? `phase-${phase}`;

  return `phases/${phaseName}/week-${week}/levels/${levelId}`;
}

/**
 * Get the full list of levels for a given week by scanning the curriculum.
 * In practice, levels are discovered by listing the week's directory.
 * For now, we return the module names from the curriculum.
 */
export function getWeekModules(curriculum: Curriculum, weekNum: number): string[] {
  for (const phase of curriculum.phases) {
    for (const week of phase.weeks) {
      if (week.week === weekNum) {
        return week.modules;
      }
    }
  }
  return [];
}

export async function loadModuleLevels(moduleId: string): Promise<LevelMeta[]> {
  const levels = await loadAllLevels();
  return levels.filter((level) => level.module === moduleId).sort((a, b) => a.order - b.order);
}

export async function loadAllLevels(): Promise<LevelMeta[]> {
  const paths = Object.keys(yamlFiles).filter((path) => path.includes('/levels/') && path.endsWith('/level.yaml'));
  const levels = await Promise.all(paths.map(async (file) => {
    const parsed = validateLevel(yaml.load(await yamlFiles[file]!()));
    return parsed.success ? parsed.data as LevelMeta : null;
  }));
  return levels.filter((level): level is LevelMeta => level !== null);
}

/**
 * Clear all caches (useful for testing or force-refresh).
 */
export function clearContentCache(): void {
  curriculumCache = null;
  levelCache.clear();
  lessonCache.clear();
}
