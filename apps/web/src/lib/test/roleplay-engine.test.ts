// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { askPersona, createRoleplayState, gradeRoleplayLevel, matchesTrigger, parsePersona, parseTranscript, questionCoaching, replayTranscript } from '../roleplay-engine';

const persona = parsePersona(JSON.stringify({
  name: 'Meena Iyer',
  role: 'Operations Manager',
  company: 'Lakshmi Textiles, Coimbatore',
  opening: 'Hello! What would you like to know?',
  facts: [
    { id: 'volume', triggers: ['how many', 'volume', 'per day'], reply: 'About 400 invoices a day.' },
    { id: 'manual-step', triggers: ['manual', 'by hand', 'walk me through'], reply: 'Two clerks type them into Tally.' },
    { id: 'cost', triggers: ['cost', 'money'], reply: 'Errors cost us ₹2 lakh a quarter.', requires: ['volume'] },
  ],
  deflections: ['Hmm, not sure.', 'Can you ask differently?'],
  max_turns: 5,
}));

describe('matchesTrigger', () => {
  it('matches whole words case-insensitively and allows word endings', () => {
    expect(matchesTrigger('HOW MANY invoices?', 'how many')).toBe(true);
    expect(matchesTrigger('Is it done manually?', 'manual')).toBe(true);
    expect(matchesTrigger('the somehow many', 'how many')).toBe(false);
    expect(matchesTrigger("What's the volume", 'volume')).toBe(true);
  });
});

describe('questionCoaching', () => {
  it('flags leading and closed questions', () => {
    expect(questionCoaching("Don't you think automation would help?")).toBeDefined();
    expect(questionCoaching('The process is slow, isn’t it?')).toBeDefined();
    expect(questionCoaching('Do you use Tally?')).toBeDefined();
    expect(questionCoaching('Is it slow?')).toBeDefined();
    expect(questionCoaching('This is painful, right?')).toBeDefined();
  });

  it('accepts open questions, including polite "can you walk me through"', () => {
    expect(questionCoaching('How do invoices reach your team?')).toBeUndefined();
    expect(questionCoaching('Can you walk me through a normal Monday?')).toBeUndefined();
    expect(questionCoaching('What happens when a number is wrong?')).toBeUndefined();
    expect(questionCoaching('Tell me about the last time a GST return was late.')).toBeUndefined();
  });
});

describe('askPersona', () => {
  it('reveals facts, respects requires, and rotates deflections', () => {
    let state = createRoleplayState();
    state = askPersona(persona, state, 'What does it cost you?').state;
    expect(state.uncovered).toEqual([]);
    expect(state.turns[0]!.reply).toBe('Hmm, not sure.');
    state = askPersona(persona, state, 'How many invoices come in per day?').state;
    expect(state.uncovered).toEqual(['volume']);
    state = askPersona(persona, state, 'What does that cost in money?').state;
    expect(state.uncovered).toEqual(['volume', 'cost']);
    state = askPersona(persona, state, 'What is the weather like?').state;
    expect(state.turns.at(-1)!.reply).toBe('Can you ask differently?');
  });

  it('counts leading questions and ends the meeting at max_turns', () => {
    const state = replayTranscript(persona, ['Do you type invoices by hand?', 'x', 'y', 'z', 'how many?', 'volume?']);
    expect(state.leadingCount).toBe(1);
    expect(state.uncovered).toEqual(['manual-step', 'volume']);
    expect(state.turns).toHaveLength(5);
    expect(state.ended).toBe(true);
  });

  it('parses transcripts and grades via shared checks', async () => {
    const questions = parseTranscript('# comment\nHow many invoices arrive per day?\n\nCan you walk me through the steps?\n');
    expect(questions).toHaveLength(2);
    const state = replayTranscript(persona, questions);
    const results = await gradeRoleplayLevel([
      { kind: 'sim_state', path: 'facts_uncovered', contains_all: ['volume', 'manual-step'] },
      { kind: 'sim_state', path: 'turns', max: 4 },
      { kind: 'sim_state', path: 'leading_questions', max: 0 },
      { kind: 'file_contains', path: 'notes.md', expected: '400' },
    ], state, { files: { 'notes.md': '400 invoices a day' } });
    expect(results.every((item) => item.passed)).toBe(true);
  });
});
