import { plainString } from '../lib/plain-string';
import { useState } from 'react';
import type { Check } from '@fde/content-schema';
import type { AiClient } from '../lib/ai/types';
import { checklistKey, type WritingCheckResult } from '../lib/writing-grader';
import styles from './WritingWorkspace.module.css';

export function RubricScores({ results }: { results: WritingCheckResult[] | null }) {
  const scored = results?.filter((result) => result.rubricScores?.length) ?? [];
  if (!scored.length) return null;
  return (
    <section className={styles.aiFeedback} aria-label="AI rubric feedback">
      <h3>AI feedback</h3>
      {scored.map((result) => (
        <ul key={result.label}>
          {result.rubricScores!.map((score) => (
            <li key={score.criterion}><strong>{score.score}/5</strong> {score.criterion}{score.feedback && <span> — {score.feedback}</span>}</li>
          ))}
        </ul>
      ))}
      <p className={styles.muted}>AI feedback is a second opinion. Your self-review checklist still matters.</p>
    </section>
  );
}

/** Checklists, shared with the roleplay workspace. */
export function SelfReview({ checks, ticks, onToggle, idPrefix }: { checks: Check[]; ticks: Record<string, boolean[]>; onToggle: (key: string, item: number, value: boolean) => void; idPrefix: string }) {
  const lists = checks.map((check, index) => ({ check, index })).filter(({ check }) => check.kind === 'checklist');
  if (!lists.length) return null;
  return (
    <>
      {lists.map(({ check, index }) => {
        const key = checklistKey(index);
        const items = Array.isArray(check.items) ? check.items.map(String) : [];
        return (
          <fieldset key={key} className={styles.checklist}>
            <legend>{typeof check.label === 'string' ? check.label : 'Self-review checklist'}</legend>
            {items.map((item, itemIndex) => {
              const id = `${idPrefix}-${key}-${itemIndex}`;
              return (
                <div key={id} className={styles.checkItem}>
                  <input id={id} type="checkbox" checked={Boolean(ticks[key]?.[itemIndex])} onChange={(event) => onToggle(key, itemIndex, event.target.checked)} />
                  <label htmlFor={id}>{item}</label>
                </div>
              );
            })}
          </fieldset>
        );
      })}
    </>
  );
}

/** Rubric shown to the learner up front (spec: always show the rubric). */
export function RubricPanel({ checks, ai }: { checks: Check[]; ai: AiClient | null }) {
  const rubric = checks.filter((check) => check.kind === 'ai_rubric');
  if (!rubric.length) return null;
  return (
    <details className={styles.rubric}>
      <summary>How the AI rubric scores this {ai ? `(using ${ai.label})` : '(optional)'}</summary>
      {rubric.map((check, index) => (
        <div key={index}>
          <ol>{(Array.isArray(check.rubric) ? check.rubric : Array.isArray(check.criteria) ? check.criteria : []).map((item) => <li key={String(item)}>{String(item)}</li>)}</ol>
          <p className={styles.muted}>Each criterion is scored 1–5. You pass at an average of {plainString(check.min_score ?? 3)} or more.</p>
        </div>
      ))}
      {!ai && <p className={styles.muted}>No AI key is set, so this part is skipped. Add your own key in Settings to get AI feedback. Never paste personal or customer data into AI exercises.</p>}
    </details>
  );
}

/** Two-step inline reset confirmation. */
export function ResetControl({ onReset, label = 'Reset level' }: { onReset: () => void; label?: string }) {
  const [confirming, setConfirming] = useState(false);
  if (!confirming) return <button type="button" className="btn btn-ghost" onClick={() => setConfirming(true)}>{label}</button>;
  return (
    <span className={styles.confirm} role="group" aria-label="Confirm reset">
      <span>Erase your work?</span>
      <button type="button" className="btn btn-secondary" onClick={() => { setConfirming(false); onReset(); }} autoFocus>Yes, reset</button>
      <button type="button" className="btn btn-ghost" onClick={() => setConfirming(false)}>Cancel</button>
    </span>
  );
}

