import type { LevelMeta } from './content-loader';

const UNLOCK_ALL = import.meta.env.VITE_UNLOCK_ALL_LEVELS === 'true';

/** Real-world levels are optional extras (order ≥ 90) and never gated. */
const OPTIONAL_ORDER = 90;

/**
 * Prerequisites for a level: levels whose `unlocks` list names it, plus the
 * previous level (by order) in the same module. The first level of every
 * module has none, so learners can start any topic.
 */
export function prerequisitesFor(level: LevelMeta, allLevels: LevelMeta[]): string[] {
  if (level.order >= OPTIONAL_ORDER) return [];
  const prereqs = new Set(allLevels.filter((other) => other.unlocks?.includes(level.id)).map((other) => other.id));
  const previous = allLevels
    .filter((other) => other.module === level.module && other.order < level.order && other.order < OPTIONAL_ORDER)
    .sort((a, b) => b.order - a.order)[0];
  if (previous) prereqs.add(previous.id);
  return [...prereqs];
}

/**
 * A level is unlocked when it has no prerequisites or any prerequisite passed.
 * `unlockAll` is the per-user override from profiles.unlock_all_levels.
 */
export function isLevelUnlocked(level: LevelMeta, allLevels: LevelMeta[], passed: ReadonlySet<string>, unlockAll = false): boolean {
  if (UNLOCK_ALL || unlockAll || passed.has(level.id)) return true;
  const prereqs = prerequisitesFor(level, allLevels);
  return prereqs.length === 0 || prereqs.some((id) => passed.has(id));
}
