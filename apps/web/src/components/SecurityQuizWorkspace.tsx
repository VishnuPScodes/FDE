import { useCallback, useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { saveProgress } from '../lib/progress';
import type { Check } from '@fde/content-schema';
import type { LevelMeta } from '../lib/content-loader';
import styles from './SecurityQuizWorkspace.module.css';

interface SecurityQuizWorkspaceProps { level: LevelMeta; hintsUsed: number; onPassed: () => void }
interface QuizResult { label: string; passed: boolean; expected: string; actual: string }

export default function SecurityQuizWorkspace({ level, hintsUsed, onPassed }: SecurityQuizWorkspaceProps) {
  const { session } = useAuth();
  const [answers, setAnswers] = useState<Record<number, string>>({});
  const [results, setResults] = useState<QuizResult[] | null>(null);
  const [attempts, setAttempts] = useState(0);
  const [message, setMessage] = useState('');

  const submit = useCallback(async () => {
    const next = level.checks.map((check: Check, index) => {
      const expected = String(check.expected ?? '');
      const actual = answers[index] ?? '';
      return { label: String(check.label ?? check.question ?? 'Security check'), passed: actual === expected, expected, actual: actual || 'No answer selected' };
    });
    setResults(next);
    const passed = next.length > 0 && next.every((result) => result.passed);
    const nextAttempts = attempts + 1;
    setAttempts(nextAttempts);
    let synced = true;
    if (session?.access_token) {
      try { await saveProgress(session.access_token, { level_id: level.id, status: passed ? 'passed' : 'in_progress', attempts: nextAttempts, hints_used: hintsUsed, time_spent_sec: 0 }); }
      catch { synced = false; }
    }
    if (passed) onPassed();
    setMessage(passed ? session?.access_token ? synced ? 'Level passed. Your progress is saved.' : 'Checks passed, but progress could not sync.' : 'Checks passed. Sign in to sync progress across devices.' : 'Review the lesson, update your answers, and submit again.');
  }, [answers, attempts, hintsUsed, level.checks, level.id, onPassed, session?.access_token]);

  return (
    <section className={styles.workspace} aria-label="Security knowledge check">
      <header><div><strong>Security review</strong><p>Choose the safest answer for each scenario.</p></div><button className="btn btn-primary" onClick={() => void submit()}>Submit</button></header>
      {level.checks.map((check: Check, index) => <fieldset className={styles.question} key={`${check.label}-${index}`}>
        <legend>{String(check.question ?? check.label ?? `Question ${index + 1}`)}</legend>
        {(Array.isArray(check.options) ? check.options : []).map((option) => <label key={String(option)}><input type="radio" name={`question-${index}`} value={String(option)} checked={answers[index] === String(option)} onChange={() => setAnswers((previous) => ({ ...previous, [index]: String(option) }))} /><span>{String(option)}</span></label>)}
        {results?.[index] && <small className={results[index]!.passed ? styles.correct : styles.incorrect}>{results[index]!.passed ? 'Correct' : `Review: ${results[index]!.expected}`}</small>}
      </fieldset>)}
      {message && <p className={styles.message} role="status">{message}</p>}
    </section>
  );
}
