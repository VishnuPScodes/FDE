import { plainString } from '../lib/plain-string';
import { useCallback, useState } from 'react';
import { useLevelSubmission } from '../hooks/useLevelSubmission';
import type { Check } from '@fde/content-schema';
import type { LevelMeta } from '../lib/content-loader';
import styles from './SecurityQuizWorkspace.module.css';
import ResettableWorkspace from './ResettableWorkspace';
import { useSubmitShortcut, submitButtonProps } from '../hooks/useSubmitShortcut';

interface SecurityQuizWorkspaceProps { level: LevelMeta; hintsUsed: number; onPassed: () => void }
interface QuizResult { label: string; passed: boolean; expected: string; actual: string }

function SecurityQuizWorkspaceInner({ level, hintsUsed, onPassed }: SecurityQuizWorkspaceProps) {
  const [answers, setAnswers] = useState<Record<number, string>>({});
  const [results, setResults] = useState<QuizResult[] | null>(null);
  const { submit: record, status: message } = useLevelSubmission({ levelId: level.id, hintsUsed, onPassed });

  const submit = useCallback(async () => {
    const next = level.checks.map((check: Check, index) => {
      const expected = plainString(check.expected ?? '');
      const actual = answers[index] ?? '';
      return { label: plainString(check.label ?? check.question ?? 'Security check'), passed: actual === expected, expected, actual: actual || 'No answer selected' };
    });
    setResults(next);
    await record(next.map((result) => ({ kind: 'multiple_choice', ...result })));
  }, [answers, level.checks, record]);

  useSubmitShortcut(submit, true);

  return (
    <section className={styles.workspace} aria-label="Security knowledge check">
      <header><div><strong>Security review</strong><p>Choose the safest answer for each scenario.</p></div><button className="btn btn-primary" {...submitButtonProps} onClick={() => void submit()}>Submit</button></header>
      {level.checks.map((check: Check, index) => <fieldset className={styles.question} key={`${check.label}-${index}`}>
        <legend>{plainString(check.question ?? check.label ?? `Question ${index + 1}`)}</legend>
        {(Array.isArray(check.options) ? check.options : []).map((option) => <label key={String(option)}><input type="radio" name={`question-${index}`} value={String(option)} checked={answers[index] === String(option)} onChange={() => setAnswers((previous) => ({ ...previous, [index]: String(option) }))} /><span>{String(option)}</span></label>)}
        {results?.[index] && <small className={results[index].passed ? styles.correct : styles.incorrect}>{results[index].passed ? 'Correct' : 'Not quite — reread the scenario and try another option.'}</small>}
      </fieldset>)}
      {message && <p className={styles.message} role="status">{message}</p>}
    </section>
  );
}

export default function SecurityQuizWorkspace(props: Parameters<typeof SecurityQuizWorkspaceInner>[0]) {
  return (
    <ResettableWorkspace clear={() => Promise.resolve()}>
      <SecurityQuizWorkspaceInner {...props} />
    </ResettableWorkspace>
  );
}
