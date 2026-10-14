import { useEffect, useState } from 'react';
import { NavLink } from 'react-router-dom';
import { loadCurriculum } from '../lib/content-loader';
import type { Curriculum, CurriculumPhase } from '../lib/content-loader';
import styles from './LearnPage.module.css';

const PHASE_COLORS: Record<number, string> = {
  0: '#5568f8',
  1: '#a855f7',
  2: '#06b6d4',
  3: '#22c55e',
  4: '#f59e0b',
  5: '#ef4444',
  6: '#ec4899',
};

const PHASE_ICONS: Record<number, string> = {
  0: '⚡',
  1: '🔌',
  2: '☁️',
  3: '🤖',
  4: '🤝',
  5: '🚀',
  6: '🎯',
};

export default function LearnPage() {
  const [curriculum, setCurriculum] = useState<Curriculum | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expandedPhase, setExpandedPhase] = useState<number | null>(0);

  useEffect(() => {
    loadCurriculum()
      .then(setCurriculum)
      .catch((err: Error) => setError(err.message))
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className={styles.page}>
        <h1 className={styles.heading}>Learn</h1>
        <div className={styles.skeletonList}>
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className={`skeleton ${styles.skeletonCard}`} />
          ))}
        </div>
      </div>
    );
  }

  if (error || !curriculum) {
    return (
      <div className={styles.page}>
        <h1 className={styles.heading}>Learn</h1>
        <div className={styles.errorBox}>
          <p>Failed to load curriculum: {error}</p>
          <p className={styles.errorHint}>
            Make sure <code>content/curriculum.yaml</code> is accessible at{' '}
            <code>/content/curriculum.yaml</code> on the dev server.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className={styles.page}>
      <div className={styles.headerRow}>
        <div>
          <h1 className={styles.heading}>Learn</h1>
          <p className={styles.subtitle}>
            24 weeks · {curriculum.phases.length} phases · Your path to becoming an FDE.
          </p>
        </div>
      </div>

      <div className={styles.phaseList}>
        {curriculum.phases.map((phase) => (
          <PhaseAccordion
            key={phase.id}
            phase={phase}
            expanded={expandedPhase === phase.id}
            onToggle={() =>
              setExpandedPhase(expandedPhase === phase.id ? null : phase.id)
            }
          />
        ))}
      </div>
    </div>
  );
}

function PhaseAccordion({
  phase,
  expanded,
  onToggle,
}: {
  phase: CurriculumPhase;
  expanded: boolean;
  onToggle: () => void;
}) {
  const color = PHASE_COLORS[phase.id] ?? '#5568f8';
  const icon = PHASE_ICONS[phase.id] ?? '📘';

  return (
    <div
      className={`${styles.phaseCard} ${expanded ? styles.phaseCardExpanded : ''}`}
      style={{ '--phase-color': color } as React.CSSProperties}
    >
      <button className={styles.phaseHeader} onClick={onToggle} aria-expanded={expanded}>
        <div className={styles.phaseHeaderLeft}>
          <span className={styles.phaseIcon}>{icon}</span>
          <div>
            <span className={styles.phaseLabel}>Phase {phase.id}</span>
            <h3 className={styles.phaseTitle}>{phase.title}</h3>
            <span className={styles.weekCount}>
              {phase.weeks.length} week{phase.weeks.length !== 1 ? 's' : ''}
            </span>
          </div>
        </div>
        <span className={`${styles.chevron} ${expanded ? styles.chevronOpen : ''}`}>▾</span>
      </button>

      {expanded && (
        <div className={styles.phaseBody}>
          {phase.weeks.map((week) => (
            <div key={week.week} className={styles.weekCard}>
              <div className={styles.weekHeader}>
                <span className={styles.weekNumber}>Week {week.week}</span>
                <h4 className={styles.weekTitle}>{week.title}</h4>
              </div>
              <div className={styles.moduleList}>
                {week.modules.map((mod) => (
                  <NavLink
                    key={mod}
                    to={`/learn/module/${mod}`}
                    className={styles.moduleLink}
                  >
                    <span className={styles.moduleDot} />
                    <span>{formatModuleName(mod)}</span>
                  </NavLink>
                ))}
              </div>
            </div>
          ))}
          {phase.project && (
            <div className={styles.projectBadge}>
              🏗️ Project checkpoint: <strong>{phase.project}</strong>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function formatModuleName(slug: string): string {
  return slug
    .split('-')
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');
}
