/**
 * Content loader — fetches curriculum.yaml, level.yaml, and lesson Markdown
 * from the CDN (or dev server in development).
 *
 * All content lives as static files under /content/ on the same origin.
 * No API calls needed — just fetch from CDN.
 */

import yaml from 'js-yaml';

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
  checks: Record<string, unknown>[];
  hints: string[];
  feedback?: { when: Record<string, unknown>; message: string }[];
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

const CONTENT_BASE = '/content';

/**
 * Load the curriculum.yaml file.
 * Cached after first load.
 */
export async function loadCurriculum(): Promise<Curriculum> {
  if (curriculumCache) return curriculumCache;

  const res = await fetch(`${CONTENT_BASE}/curriculum.yaml`);
  if (!res.ok) throw new Error(`Failed to load curriculum: ${res.status}`);

  const text = await res.text();
  const data = yaml.load(text) as Curriculum;

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

  // Derive the file path from the level ID
  const path = levelIdToPath(levelId);
  const res = await fetch(`${CONTENT_BASE}/${path}/level.yaml`);
  if (!res.ok) throw new Error(`Failed to load level ${levelId}: ${res.status}`);

  const text = await res.text();
  const data = yaml.load(text) as LevelMeta;

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
  const res = await fetch(`${CONTENT_BASE}/${normalized}`);
  if (!res.ok) throw new Error(`Failed to load lesson: ${res.status}`);

  const text = await res.text();
  lessonCache.set(lessonPath, text);
  return text;
}

/**
 * Load a starter file for a level.
 */
export async function loadStarterFile(levelId: string, filePath: string): Promise<string> {
  const levelPath = levelIdToPath(levelId);
  const res = await fetch(`${CONTENT_BASE}/${levelPath}/starter/${filePath}`);
  if (!res.ok) {
    // Try from content field in level.yaml
    return '';
  }
  return res.text();
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

/**
 * Clear all caches (useful for testing or force-refresh).
 */
export function clearContentCache(): void {
  curriculumCache = null;
  levelCache.clear();
  lessonCache.clear();
}
