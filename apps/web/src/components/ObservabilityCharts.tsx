import type { ChartSeries, Span } from '../lib/observability/types';
import styles from './ObservabilityWorkspace.module.css';

const COLORS = ['var(--color-brand-400)', 'var(--color-warning-400)', 'var(--color-success-400)', 'var(--color-accent-400)', 'var(--color-error-400)', 'var(--color-brand-200)', 'var(--color-warning-500)', 'var(--color-accent-600)'];

function niceMax(value: number): number {
  if (!Number.isFinite(value) || value <= 0) return 1;
  const exponent = 10 ** Math.floor(Math.log10(value));
  for (const step of [1, 2, 2.5, 5, 10]) if (step * exponent >= value) return step * exponent;
  return 10 * exponent;
}

function compact(value: number): string {
  if (value === 0) return '0';
  if (Math.abs(value) >= 1e9) return (value / 1e9).toFixed(1) + 'G';
  if (Math.abs(value) >= 1e6) return (value / 1e6).toFixed(1) + 'M';
  if (Math.abs(value) >= 1e3) return (value / 1e3).toFixed(1) + 'k';
  if (Math.abs(value) < 0.01) return value.toExponential(0);
  return String(Math.round(value * 1000) / 1000);
}

/** Minimal inline SVG line chart over the scenario hour (10:00–10:59). */
export function LineChart({ series, title, markers = [] }: { series: ChartSeries[]; title: string; markers?: { minute: number; label: string }[] }) {
  const width = 640;
  const height = 180;
  const pad = { left: 46, right: 12, top: 12, bottom: 24 };
  const finite = series.flatMap((item) => item.values.filter((value) => Number.isFinite(value)));
  if (finite.length === 0) return <p className={styles.muted}>No data points to chart.</p>;
  const maxValue = niceMax(Math.max(...finite));
  const minValue = Math.min(0, ...finite);
  const points = series[0]?.values.length ?? 60;
  const x = (index: number) => pad.left + (index / Math.max(points - 1, 1)) * (width - pad.left - pad.right);
  const y = (value: number) => pad.top + (1 - (value - minValue) / (maxValue - minValue || 1)) * (height - pad.top - pad.bottom);
  const paths = series.map((item) => {
    let d = '';
    let pen = false;
    item.values.forEach((value, index) => {
      if (!Number.isFinite(value)) { pen = false; return; }
      d += (pen ? 'L' : 'M') + x(index).toFixed(1) + ' ' + y(value).toFixed(1) + ' ';
      pen = true;
    });
    return d.trim();
  });
  const peak = finite.reduce((best, value) => Math.max(best, value), Number.NEGATIVE_INFINITY);
  return (
    <figure className={styles.chart}>
      <svg viewBox={`0 0 ${width} ${height}`} role="img" aria-label={`${title}. ${series.length} series from 10:00 to 10:59. Highest value ${compact(peak)}.`} preserveAspectRatio="none">
        {[0, 0.5, 1].map((fraction) => {
          const value = minValue + (maxValue - minValue) * fraction;
          return (
            <g key={fraction}>
              <line x1={pad.left} x2={width - pad.right} y1={y(value)} y2={y(value)} className={styles.gridLine} />
              <text x={pad.left - 6} y={y(value) + 4} textAnchor="end" className={styles.axisText}>{compact(value)}</text>
            </g>
          );
        })}
        {[0, 15, 30, 45, 59].map((minute) => (
          <text key={minute} x={x(minute)} y={height - 6} textAnchor="middle" className={styles.axisText}>{'10:' + String(minute).padStart(2, '0')}</text>
        ))}
        {markers.map((marker) => (
          <g key={`${marker.label}${marker.minute}`}>
            <rect x={x(marker.minute)} y={pad.top} width={Math.max(2, x(1) - x(0))} height={height - pad.top - pad.bottom} className={styles.marker} />
          </g>
        ))}
        {paths.map((d, index) => d && <path key={index} d={d} fill="none" stroke={COLORS[index % COLORS.length]} strokeWidth={1.8} vectorEffect="non-scaling-stroke" />)}
      </svg>
      <figcaption className={styles.legend}>
        {series.map((item, index) => (
          <span key={`${item.label}${index}`}><i style={{ background: COLORS[index % COLORS.length] }} aria-hidden="true" />{item.label}</span>
        ))}
      </figcaption>
    </figure>
  );
}

/** Trace waterfall: one row per span, bars positioned by start offset and duration. */
export function Waterfall({ spans }: { spans: Span[] }) {
  if (spans.length === 0) return null;
  const root = spans[0]!;
  const total = Math.max(root.duration_ms, 1);
  const depth = new Map<string, number>();
  for (const span of spans) depth.set(span.span_id, span.parent_span_id ? (depth.get(span.parent_span_id) ?? 0) + 1 : 0);
  return (
    <div className={styles.waterfall} role="table" aria-label={`Trace waterfall for ${root.trace_id}`}>
      <div role="rowgroup">
        {spans.map((span) => {
          const left = ((span.start_ms - root.start_ms) / total) * 100;
          const widthPct = Math.max((span.duration_ms / total) * 100, 0.6);
          return (
            <div role="row" key={span.span_id} className={styles.waterfallRow}>
              <span role="cell" className={styles.spanName} style={{ paddingLeft: `${(depth.get(span.span_id) ?? 0) * 0.9}rem` }} title={Object.entries(span.attributes).map(([key, value]) => `${key}=${String(value)}`).join('\n')}>
                <b>{span.service}</b> {span.name}
              </span>
              <span role="cell" className={styles.spanTrack}>
                <span className={span.status === 'error' ? styles.spanBarError : styles.spanBar} style={{ left: `${Math.min(left, 99)}%`, width: `${Math.min(widthPct, 100 - Math.min(left, 99))}%` }} />
              </span>
              <span role="cell" className={styles.spanDuration}>{span.duration_ms} ms{span.status === 'error' ? ' · error' : ''}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
