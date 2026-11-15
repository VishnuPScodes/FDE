// @vitest-environment node
import { describe, expect, it } from 'vitest';
import type { Check } from '@fde/content-schema';
import type { AiClient } from '../ai/types';
import { AI_SKIPPED_MESSAGE, checklistKey, countWords, extractSection, gradeWritingLevel, gradeWritingOffline } from '../writing-grader';

const doc = `# Invoice matching for Lakshmi Textiles

<!-- Template guidance: this comment must not count. -->

## Goal
Cut manual GST invoice matching from 6 hours a day to 1 hour.

## Risks
### Data quality
Scanned invoices from small suppliers are blurry.

## Rollout
Start with one branch in Tiruppur.
`;

describe('text helpers', () => {
  it('counts words and ignores Markdown symbols and comments', () => {
    expect(countWords('## Goal\n- one, two **three**')).toBe(4);
    expect(countWords('<!-- hidden words here -->visible')).toBe(1);
    expect(countWords('₹ 4,500 per month')).toBe(3);
  });

  it('extracts a section up to the next heading of the same or higher level', () => {
    expect(extractSection(doc, 'risks')).toBe('### Data quality\nScanned invoices from small suppliers are blurry.');
    expect(extractSection(doc, 'Data Quality')).toBe('Scanned invoices from small suppliers are blurry.');
    expect(extractSection(doc, 'Rollout')).toBe('Start with one branch in Tiruppur.');
    expect(extractSection(doc, 'Budget')).toBeNull();
  });

  it('matches numbered and colon-suffixed headings', () => {
    expect(extractSection('## 1. Goal:\nShip it.\n## 2. Users\nOps', 'Goal')).toBe('Ship it.');
  });

  it('ignores headings inside code fences', () => {
    expect(extractSection('## Risks\n```\n# not a heading\n```\nReal risk.\n## Next', 'Risks')).toContain('Real risk.');
  });
});

describe('gradeWritingLevel', () => {
  const checks: Check[] = [
    { kind: 'file_contains', path: 'answer.md', expected: '## risks' },
    { kind: 'sim_state', path: 'word_count', min: 10, max: 600 },
    { kind: 'sim_state', path: 'section:Risks', min_words: 5 },
    { kind: 'sim_state', path: 'section:Risks', contains_any: ['blurry', 'fallback'] },
    { kind: 'sim_state', path: 'section:Goal', contains_all: ['gst', 'hours'] },
  ];

  it('passes a document that meets every check', async () => {
    const results = await gradeWritingOffline(checks, { 'answer.md': doc });
    expect(results.map((item) => item.passed)).toEqual([true, true, true, true, true]);
  });

  it('fails missing sections, short text and missing terms', async () => {
    const results = await gradeWritingOffline(checks, { 'answer.md': '## Goal\nCut hours.\n' });
    expect(results.map((item) => item.passed)).toEqual([false, false, false, false, false]);
    expect(results[2]!.actual).toBe('Section missing');
  });

  it('respects the max word bound', async () => {
    const [result] = await gradeWritingOffline([{ kind: 'sim_state', path: 'word_count', max: 3 }], { 'answer.md': 'one two three four' });
    expect(result!.passed).toBe(false);
  });

  it('requires every checklist item to be ticked', async () => {
    const list: Check[] = [{ kind: 'checklist', label: 'Review', items: ['BLUF first', 'Numbers in ₹'] }];
    const none = await gradeWritingLevel(list, { files: { 'answer.md': doc } });
    expect(none[0]!.passed).toBe(false);
    const half = await gradeWritingLevel(list, { files: {}, ticks: { [checklistKey(0)]: [true, false] } });
    expect(half[0]!.passed).toBe(false);
    const all = await gradeWritingLevel(list, { files: {}, ticks: { [checklistKey(0)]: [true, true] } });
    expect(all[0]!.passed).toBe(true);
  });

  it('enforces time limits unless advisory', async () => {
    const strict: Check[] = [{ kind: 'time_limit', minutes: 20 }];
    const started = 1_000_000;
    expect((await gradeWritingLevel(strict, { files: {}, timerStartedAt: started, now: started + 19 * 60_000 }))[0]!.passed).toBe(true);
    expect((await gradeWritingLevel(strict, { files: {}, timerStartedAt: started, now: started + 21 * 60_000 }))[0]!.passed).toBe(false);
    expect((await gradeWritingLevel(strict, { files: {} }))[0]!.passed).toBe(false);
    const advisory: Check[] = [{ kind: 'time_limit', minutes: 20, advisory: true }];
    expect((await gradeWritingLevel(advisory, { files: {}, timerStartedAt: started, now: started + 40 * 60_000 }))[0]!.passed).toBe(true);
    expect((await gradeWritingOffline(strict, {}))[0]!.passed).toBe(true);
  });

  it('skips AI rubric checks when there is no key', async () => {
    const [result] = await gradeWritingLevel([{ kind: 'ai_rubric', rubric: ['Clear ask'], min_score: 3 }], { files: { 'answer.md': doc }, ai: null });
    expect(result!.passed).toBe(true);
    expect(result!.actual).toBe(AI_SKIPPED_MESSAGE);
  });

  it('averages AI rubric scores against min_score', async () => {
    const fake = (scores: number[]): AiClient => ({ label: 'fake', complete: () => Promise.resolve(`Here you go: {"scores":[${scores.map((score) => `{"criterion":"x","score":${score},"feedback":"note"}`).join(',')}]}`) });
    const check: Check[] = [{ kind: 'ai_rubric', rubric: ['A', 'B'], min_score: 3 }];
    const high = await gradeWritingLevel(check, { files: { 'answer.md': doc }, ai: fake([4, 3]) });
    expect(high[0]!.passed).toBe(true);
    expect(high[0]!.rubricScores).toHaveLength(2);
    const low = await gradeWritingLevel(check, { files: { 'answer.md': doc }, ai: fake([2, 3]) });
    expect(low[0]!.passed).toBe(false);
  });

  it('treats an AI failure as skipped', async () => {
    const broken: AiClient = { label: 'broken', complete: () => Promise.reject(new Error('429')) };
    const [result] = await gradeWritingLevel([{ kind: 'ai_rubric', rubric: ['A'] }], { files: { 'answer.md': doc }, ai: broken });
    expect(result!.passed).toBe(true);
  });

  it('grades metrics such as roleplay facts', async () => {
    const results = await gradeWritingOffline([
      { kind: 'sim_state', path: 'facts_uncovered', contains_all: ['volume', 'manual-step'] },
      { kind: 'sim_state', path: 'turns', max: 12 },
    ], {}, { metrics: { facts_uncovered: ['volume'], turns: 13 } });
    expect(results.map((item) => item.passed)).toEqual([false, false]);
  });
});
