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

export interface LintWarning {
  line: number | null;
  message: string;
};

export interface LintResult {
  warnings: LintWarning[];
  wordCount: number;
  readingLevel: number;
}

export interface StyleLintOptions { bannedWords?: readonly string[] }

// ─── Linter implementation ────────────────────────────────────────────────────

/**
 * Lints a lesson Markdown string and returns warnings.
 * @param markdown Raw lesson markdown content
 * @param filename For error messages
 */
export function lintLesson(markdown: string, filename = 'lesson.md', options: StyleLintOptions = {}): LintResult {
  const warnings: LintWarning[] = [];
  const lines = markdown.split('\n');

  // Strip code blocks for prose analysis
  const withoutCode = stripCodeBlocks(markdown);
  const words = withoutCode.trim().split(/\s+/).filter(Boolean);
  const wordCount = words.length;
  const readingLevel = estimateReadingLevel(withoutCode);

  // Word count check
  if (wordCount > MAX_WORDS) {
    warnings.push({
      line: null,
      message: `${filename}: Lesson is ${String(wordCount)} words (limit: ${String(MAX_WORDS)}). Keep it short; depth comes from levels.`,
    });
  }

  // Banned words
  for (const [lineIndex, line] of lines.entries()) {
    const lower = line.toLowerCase();
    for (const banned of options.bannedWords ?? BANNED_WORDS) {
      if (lower.includes(banned)) {
        warnings.push({
          line: lineIndex + 1,
          message: `${filename}:${String(lineIndex + 1)}: Banned word/phrase found: "${banned}"`,
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
        message: `${filename}: Paragraph is ${String(paraWords.length)} words (limit: ${String(MAX_PARAGRAPH_WORDS)}). Break it up.`,
      });
    }
  }

  // Too many bullet lists
  const bulletListCount = countBulletLists(lines);
  if (bulletListCount > MAX_BULLET_LISTS) {
    warnings.push({
      line: null,
      message: `${filename}: ${String(bulletListCount)} bullet lists found (limit: ${String(MAX_BULLET_LISTS)}). Use prose instead.`,
    });
  }

  // Too many bold phrases
  const boldCount = (markdown.match(/\*\*[^*]+\*\*/g) ?? []).length;
  if (boldCount > MAX_BOLD_PHRASES) {
    warnings.push({
      line: null,
      message: `${filename}: ${String(boldCount)} bold phrases found (limit: ${String(MAX_BOLD_PHRASES)}). Use bold sparingly.`,
    });
  }

  return { warnings, wordCount, readingLevel };
}

function estimateReadingLevel(text: string): number {
  const prose = text.replace(/[#>*_`]/g, ' ');
  const words = prose.match(/[a-z]+(?:['’][a-z]+)?/gi) ?? [];
  if (words.length === 0) return 0;
  const sentences = Math.max(1, (prose.match(/[.!?]+/g) ?? []).length);
  const syllables = words.reduce((total, word) => total + countSyllables(word), 0);
  return Math.max(0, Math.round((0.39 * (words.length / sentences) + 11.8 * (syllables / words.length) - 15.59) * 10) / 10);
}

function countSyllables(word: string): number {
  const normalized = word.toLowerCase().replace(/[^a-z]/g, '');
  if (!normalized) return 1;
  const groups = normalized.match(/[aeiouy]+/g)?.length ?? 1;
  return Math.max(1, groups - (normalized.endsWith('e') && groups > 1 ? 1 : 0));
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
