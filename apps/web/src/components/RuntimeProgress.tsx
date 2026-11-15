import styles from './RuntimeProgress.module.css';

/** Formats a download status line, e.g. "Loading linux.iso · 42%". */
export function formatDownloadStatus(label: string, loaded: number, total: number): string {
  if (total > 0) return `${label} · ${Math.min(100, Math.floor((loaded / total) * 100))}%`;
  return `${label}…`;
}

interface Props {
  label: string;
  /** 0-100; omit for an indeterminate bar. */
  percent?: number;
}

export default function RuntimeProgress({ label, percent }: Props) {
  const determinate = typeof percent === 'number';
  return (
    <div className={styles.wrap} role="status">
      <span className={styles.label}>{label}</span>
      <div
        className={styles.track}
        role="progressbar"
        aria-label={label}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={determinate ? Math.round(percent) : undefined}
      >
        <div
          className={`${styles.bar} ${determinate ? '' : styles.indeterminate}`}
          style={determinate ? { width: `${Math.max(0, Math.min(100, percent))}%` } : undefined}
        />
      </div>
    </div>
  );
}
