import type { PassStats, SubmissionCheckResult } from '../hooks/useLevelSubmission';
import styles from './CheckResultsPanel.module.css';

interface Props { results: SubmissionCheckResult[] | null; status?: string; stats?: PassStats | null }

/** Human-friendly duration, e.g. "45s" or "3m 05s". */
export function formatDuration(totalSec: number): string {
  const sec = Math.max(0, Math.round(totalSec));
  if (sec < 60) return `${sec}s`;
  const minutes = Math.floor(sec / 60);
  const rest = sec % 60;
  if (minutes < 60) return `${minutes}m ${String(rest).padStart(2, '0')}s`;
  return `${Math.floor(minutes / 60)}h ${String(minutes % 60).padStart(2, '0')}m`;
}

/** Per-check pass/fail list with expected vs actual, shared by level workspaces. */
export default function CheckResultsPanel({ results, status, stats }: Props) {
  if (!results && !status) return null;
  const allPassed = Boolean(results?.length) && results!.every((check) => check.passed);
  return (
    <div className={styles.panel} aria-live="polite">
      {results && allPassed && stats && (
        <div className={styles.banner} role="status">
          <span aria-hidden="true" className={styles.bannerIcon}>✓</span>
          <strong>Level passed</strong>
          <span className={styles.bannerMeta}>{formatDuration(stats.timeSec)} · {stats.attempts} {stats.attempts === 1 ? 'attempt' : 'attempts'}</span>
        </div>
      )}
      {results && (
        <>
          <h3 className={`${styles.heading} ${allPassed ? styles.passed : styles.failed}`}>
            {allPassed ? 'All checks passed' : `${results.filter((check) => check.passed).length} of ${results.length} checks passed`}
          </h3>
          <ul className={styles.list}>
            {results.map((check, index) => (
              <li key={`${check.kind}-${index}`} className={styles.item}>
                <span className={styles.label}>
                  <span aria-hidden="true" className={check.passed ? styles.passed : styles.failed}>{check.passed ? '✓' : '✗'}</span>
                  <span>{check.label}</span>
                  <span className="sr-only">{check.passed ? 'passed' : 'failed'}</span>
                </span>
                {!check.passed && (
                  <span className={styles.diff}>
                    <code>Expected: {check.expected || '(no specific value)'}</code>
                    <code>Got: {check.actual || '(empty)'}</code>
                  </span>
                )}
                {!check.passed && check.feedback && <span className={styles.feedback}>{check.feedback}</span>}
              </li>
            ))}
          </ul>
        </>
      )}
      {status && <p className={styles.status} role="status">{status}</p>}
    </div>
  );
}
