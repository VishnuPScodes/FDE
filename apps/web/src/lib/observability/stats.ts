/** Nearest-rank percentile (p in 0..100). Returns NaN for an empty list. */
export function percentile(values: readonly number[], p: number): number {
  if (values.length === 0) return Number.NaN;
  const sorted = [...values].sort((a, b) => a - b);
  const rank = Math.max(1, Math.ceil((p / 100) * sorted.length));
  return sorted[Math.min(rank, sorted.length) - 1] ?? Number.NaN;
}

export function average(values: readonly number[]): number {
  if (values.length === 0) return Number.NaN;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

export function round(value: number, digits = 2): number {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

/** "10:07" for minute 7 of the scenario hour. */
export function clockMinute(minute: number): string {
  return '10:' + String(minute).padStart(2, '0');
}

/** "10:07:31" for a millisecond offset from 10:00:00. */
export function clock(ms: number): string {
  const totalSeconds = Math.floor(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return '10:' + String(minutes).padStart(2, '0') + ':' + String(seconds).padStart(2, '0');
}

export function isoTimestamp(ms: number): string {
  return '2026-11-09T' + clock(ms) + '.' + String(Math.floor(ms % 1000)).padStart(3, '0') + '+05:30';
}

export function formatNumber(value: number): string {
  if (!Number.isFinite(value)) return String(value);
  if (Math.abs(value) >= 1e6) return value.toExponential(3);
  if (Number.isInteger(value)) return String(value);
  return String(round(value, Math.abs(value) < 0.01 ? 6 : 4));
}
