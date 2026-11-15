/** Pure helpers for terminal-style command history and Tab completion. */

export type HistoryDir = 'up' | 'down';

/**
 * Move through command history. `index` counts back from the newest entry
 * (-1 = fresh line). Returns the new index and the line to show (null = restore draft).
 */
export function stepHistory(history: string[], index: number, dir: HistoryDir): { index: number; line: string | null } {
  if (!history.length) return { index: -1, line: null };
  const next = dir === 'up' ? Math.min(index + 1, history.length - 1) : Math.max(index - 1, -1);
  return { index: next, line: next === -1 ? null : history[history.length - 1 - next]! };
}

export interface Completion { value: string; options: string[] }

function commonPrefix(words: string[]): string {
  let prefix = words[0] ?? '';
  for (const word of words) while (!word.startsWith(prefix)) prefix = prefix.slice(0, -1);
  return prefix;
}

/**
 * Complete the last token of `line` against known command phrases (multi-word, e.g. "git commit")
 * and, for arguments, file names. Returns the new line value plus the ambiguous options (if several).
 */
export function completeLine(line: string, phrases: readonly string[], files: readonly string[] = []): Completion {
  const start = line.lastIndexOf(' ') + 1;
  const current = line.slice(start);
  const found = new Set<string>();
  for (const phrase of phrases) {
    if (phrase.startsWith(line) && phrase.length > line.length) found.add(phrase.slice(start).split(' ')[0]!);
  }
  const isFile = new Set<string>();
  if (start > 0) {
    for (const file of files) if (file.startsWith(current) && file.length > current.length) { found.add(file); isFile.add(file); }
  }
  const options = [...found].sort();
  if (!options.length) return { value: line, options: [] };
  const base = line.slice(0, start);
  if (options.length === 1) {
    const only = options[0]!;
    return { value: base + only + (isFile.has(only) ? '' : ' '), options };
  }
  return { value: base + commonPrefix(options), options };
}
