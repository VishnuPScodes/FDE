/**
 * Style linter for lesson Markdown files.
 * Warns; does not block publication.
 * See Part 7.4 of the build prompt.
 */

// ─── Banned words/phrases (configurable) ─────────────────────────────────────

const BANNED_WORDS: readonly string[] = [
  'delve',
  'leverage',
  'robust',
  'seamless',
  'unlock',
  'elevate',
  'tapestry',
  'realm',
  'crucial',
  'game-changer',
  'embark',
  'dive in',
  "let's dive in",
  "in today's fast-paced world",
  "in this lesson we will explore",
  "in this lesson, we will explore",
  'great job',
];

const BANNED_OPENERS: readonly string[] = [
  "in today's",
  "let's dive",
  'in this lesson we will',
  'in this lesson, we will',
  'welcome to',
];

// ─── Limits ───────────────────────────────────────────────────────────────────

const MAX_WORDS = 600;
const MAX_PARAGRAPH_WORDS = 80;
const MAX_BULLET_LISTS = 2;
const MAX_BOLD_PHRASES = 3;

// ─── Types ────────────────────────────────────────────────────────────────────

export type LintWarning = {
  line: number | null;
  message: string;
};

export type LintResult = {
  warnings: LintWarning[];
  wordCount: number;
};

// ─── Linter implementation ────────────────────────────────────────────────────

/**
 * Lints a lesson Markdown string and returns warnings.
 * @param markdown Raw lesson markdown content
 * @param filename For error messages
 */
export function lintLesson(markdown: string, filename = 'lesson.md'): LintResult {
  const warnings: LintWarning[] = [];
  const lines = markdown.split('\n');

  // Strip code blocks for prose analysis
  const withoutCode = stripCodeBlocks(markdown);
  const words = withoutCode.trim().split(/\s+/).filter(Boolean);
  const wordCount = words.length;

  // Word count check
  if (wordCount > MAX_WORDS) {
    warnings.push({
      line: null,
      message: `${filename}: Lesson is ${wordCount} words (limit: ${MAX_WORDS}). Keep it short; depth comes from levels.`,
    });
  }

  // Banned words
  for (const [lineIndex, line] of lines.entries()) {
    const lower = line.toLowerCase();
    for (const banned of BANNED_WORDS) {
      if (lower.includes(banned)) {
        warnings.push({
          line: lineIndex + 1,
          message: `${filename}:${lineIndex + 1}: Banned word/phrase found: "${banned}"`,
        });
      }
    }
  }

  // Banned openers (first non-empty line after headings)
  const firstPara = lines.find((l) => l.trim() && !l.startsWith('#'));
  if (firstPara) {
    const lower = firstPara.toLowerCase().trim();
    for (const opener of BANNED_OPENERS) {
      if (lower.startsWith(opener)) {
        warnings.push({
          line: null,
          message: `${filename}: Lesson starts with banned opener: "${firstPara.trim()}"`,
        });
      }
    }
  }

  // Long paragraphs
  const paragraphs = withoutCode.split(/\n\s*\n/);
  for (const para of paragraphs) {
    const paraWords = para.trim().split(/\s+/).filter(Boolean);
    if (paraWords.length > MAX_PARAGRAPH_WORDS) {
      warnings.push({
        line: null,
        message: `${filename}: Paragraph is ${paraWords.length} words (limit: ${MAX_PARAGRAPH_WORDS}). Break it up.`,
      });
    }
  }

  // Too many bullet lists
  const bulletListCount = countBulletLists(lines);
  if (bulletListCount > MAX_BULLET_LISTS) {
    warnings.push({
      line: null,
      message: `${filename}: ${bulletListCount} bullet lists found (limit: ${MAX_BULLET_LISTS}). Use prose instead.`,
    });
  }

  // Too many bold phrases
  const boldCount = (markdown.match(/\*\*[^*]+\*\*/g) ?? []).length;
  if (boldCount > MAX_BOLD_PHRASES) {
    warnings.push({
      line: null,
      message: `${filename}: ${boldCount} bold phrases found (limit: ${MAX_BOLD_PHRASES}). Use bold sparingly.`,
    });
  }

  return { warnings, wordCount };
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function stripCodeBlocks(md: string): string {
  // Remove fenced code blocks
  return md.replace(/```[\s\S]*?```/g, '').replace(/`[^`]+`/g, '');
}

function countBulletLists(lines: string[]): number {
  let count = 0;
  let inList = false;
  for (const line of lines) {
    const isBullet = /^\s*[-*+]\s/.test(line);
    if (isBullet && !inList) {
      count++;
      inList = true;
    } else if (!isBullet && line.trim() === '') {
      inList = false;
    }
  }
  return count;
}
