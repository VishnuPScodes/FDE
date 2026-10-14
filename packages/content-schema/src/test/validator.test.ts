import { describe, it, expect } from 'vitest';
import { validateLevel } from '../validator';
import { lintLesson } from '../style-linter';

describe('validateLevel', () => {
  it('accepts a valid level', () => {
    const validLevel = {
      id: 'p0-w01-py-001',
      title: 'Say my name',
      phase: 0,
      week: 1,
      module: 'python-basics',
      order: 1,
      difficulty: 1,
      estimated_minutes: 3,
      type: 'code',
      environment: 'python',
      task: 'Print the name **Vishnu** in the terminal.',
      checks: [
        {
          kind: 'stdout_equals',
          run: 'python main.py',
          expected: 'Vishnu\n',
          normalize: ['trim_trailing_whitespace'],
        },
      ],
      hints: ['Python has a built-in function that shows text.', 'Try: print("...")'],
      unlocks: ['p0-w01-py-002'],
      tags: ['python', 'print'],
    };
    const result = validateLevel(validLevel);
    expect(result.success).toBe(true);
  });

  it('rejects a level with bad ID format', () => {
    const result = validateLevel({ id: 'bad-id', title: 'x', phase: 0, week: 1 });
    expect(result.success).toBe(false);
  });

  it('rejects a level with only 1 hint', () => {
    const result = validateLevel({
      id: 'p0-w01-py-001',
      title: 'Test level',
      phase: 0,
      week: 1,
      module: 'test',
      order: 1,
      difficulty: 1,
      estimated_minutes: 5,
      type: 'code',
      environment: 'python',
      task: 'Do something useful here.',
      checks: [{ kind: 'exit_code', run: 'python main.py', expected: 0 }],
      hints: ['Only one hint'],
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.errors.some((e) => e.includes('2 hints'))).toBe(true);
    }
  });
});

describe('lintLesson', () => {
  it('flags banned words', () => {
    const result = lintLesson('This is a seamless solution that will elevate your skills.');
    expect(result.warnings.some((w) => w.message.includes('seamless'))).toBe(true);
    expect(result.warnings.some((w) => w.message.includes('elevate'))).toBe(true);
  });

  it('passes a clean lesson', () => {
    const clean = `
## What you will do

Write a Python function that reads a CSV file and prints the row count.

\`\`\`python
import csv
with open('data.csv') as f:
    rows = list(csv.reader(f))
print(len(rows))
\`\`\`

On the job, you will do this when a customer hands you a mystery spreadsheet.
    `;
    const result = lintLesson(clean);
    expect(result.warnings.filter((w) => !w.message.includes('Lesson is'))).toHaveLength(0);
  });

  it('flags too many bold phrases', () => {
    const result = lintLesson('**one** **two** **three** **four** extra bold text here.');
    expect(result.warnings.some((w) => w.message.includes('bold phrases'))).toBe(true);
  });
});
