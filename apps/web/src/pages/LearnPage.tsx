import { useEffect, useState } from 'react';
import { NavLink, useParams } from 'react-router-dom';
import { loadAllLevels, loadCurriculum } from '../lib/content-loader';
import type { Curriculum, CurriculumPhase, LevelMeta } from '../lib/content-loader';
import { useAuth } from '../contexts/AuthContext';
import { getLocalProgress, getProgress } from '../lib/progress';
import { isLevelUnlocked } from '../lib/unlocks';
import { formatModuleName } from '../lib/format';
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
  const { moduleId } = useParams<{ moduleId: string }>();
  const { session } = useAuth();
  const [curriculum, setCurriculum] = useState<Curriculum | null>(null);
  const [allLevels, setAllLevels] = useState<LevelMeta[]>([]);
  const [passedLevels, setPassedLevels] = useState<Set<string>>(() => new Set(getLocalProgress().filter((row) => row.status === 'passed').map((row) => row.level_id)));
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expandedPhase, setExpandedPhase] = useState<number | null>(0);
  const [query, setQuery] = useState('');

  useEffect(() => {
    void loadAllLevels().then(setAllLevels).catch(() => setAllLevels([]));
    loadCurriculum()
      .then(setCurriculum)
      .catch((err: unknown) => setError(err instanceof Error ? err.message : String(err)))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    // Module links render their overview in this page; reset scroll so the
    // newly selected module and its level links are visible immediately.
    window.scrollTo(0, 0);
    if (curriculum && moduleId) {
      const phase = curriculum.phases.find((item) => item.weeks.some((week) => week.modules.includes(moduleId)));
      if (phase) setExpandedPhase(phase.id);
    }
  }, [moduleId, curriculum]);

  const moduleLevels = moduleId ? allLevels.filter((level) => level.module === moduleId).sort((a, b) => a.order - b.order) : [];

  useEffect(() => {
    if (session?.access_token) {
      void getProgress(session.access_token).then((rows) => setPassedLevels(new Set(rows.filter((row) => row.status === 'passed').map((row) => row.level_id)))).catch(() => undefined);
    }
  }, [session?.access_token]);

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
        <input
          type="search"
          className={styles.search}
          placeholder="Search levels (title, topic, tool)…"
          aria-label="Search levels"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
        />
      </div>

      {query.trim().length >= 2 && (() => {
        const terms = query.toLowerCase().split(/\s+/).filter(Boolean);
        const matches = allLevels
          .filter((level) => {
            const haystack = [level.title, level.module, level.environment, level.type, ...(level.tags ?? [])].join(' ').toLowerCase();
            return terms.every((term) => haystack.includes(term));
          })
          .sort((a, b) => a.phase - b.phase || a.week - b.week || a.order - b.order)
          .slice(0, 50);
        return (
          <section aria-label="Search results" className={styles.moduleList}>
            <p className={styles.subtitle} aria-live="polite">{matches.length === 0 ? 'No levels match.' : `${matches.length}${matches.length === 50 ? '+' : ''} matching levels`}</p>
            {matches.map((level) => {
              const passed = passedLevels.has(level.id);
              return <NavLink key={level.id} to={`/level/${level.id}`} className={styles.moduleLink}>
                <span aria-hidden="true">{passed ? '✅' : '▶️'}</span><span>{level.title}</span><small>Week {level.week} · {formatModuleName(level.module)}</small>
              </NavLink>;
            })}
          </section>
        );
      })()}

      {moduleId && (
        <section aria-label={`${formatModuleName(moduleId)} levels`}>
          {(() => {
            const phase = curriculum.phases.find((item) => item.weeks.some((week) => week.modules.includes(moduleId)));
            const week = phase?.weeks.find((item) => item.modules.includes(moduleId));
            const done = moduleLevels.filter((level) => passedLevels.has(level.id)).length;
            const total = moduleLevels.length;
            const pct = total === 0 ? 0 : Math.round((done / total) * 100);
            const minutes = moduleLevels.reduce((sum, level) => sum + (level.estimated_minutes || 0), 0);
            const time = minutes >= 60 ? `${Math.floor(minutes / 60)} h${minutes % 60 ? ` ${minutes % 60} min` : ''}` : `${minutes} min`;
            return (
              <header className={styles.moduleHeader}>
                {week && <span className={styles.moduleWeek}>{phase ? `Phase ${phase.id} · ` : ''}Week {week.week}</span>}
                <h2 className={styles.moduleTitle}>{formatModuleName(moduleId)}</h2>
                {week && <p className={styles.moduleDesc}>{week.title}</p>}
                <div className={styles.moduleMeta}>
                  <span>{done}/{total} levels passed</span>
                  {total > 0 && <span>~{time} total</span>}
                </div>
                <div className={styles.moduleBar} role="progressbar" aria-label="Module progress" aria-valuemin={0} aria-valuemax={100} aria-valuenow={pct}>
                  <div className={styles.moduleBarFill} style={{ width: `${pct}%` }} />
                </div>
              </header>
            );
          })()}
          {moduleLevels.length === 0 ? <p>No levels are published in this module yet.</p> : (
            <div className={styles.moduleList}>
              {moduleLevels.map((level, index) => {
                const passed = passedLevels.has(level.id);
                const unlocked = isLevelUnlocked(level, allLevels, passedLevels);
                const optional = level.order >= 90;
                return <NavLink key={level.id} to={`/level/${level.id}`} className={`${styles.moduleLink} ${unlocked ? '' : styles.lockedLink}`} aria-label={`${level.title}${passed ? ', passed' : unlocked ? '' : ', locked'}`}>
                  <span aria-hidden="true">{passed ? '✅' : unlocked ? '▶️' : '🔒'}</span><span>{optional ? 'Real world' : index + 1}. {level.title}</span><small>{passed ? 'Passed' : `${level.type} · ~${level.estimated_minutes} min`}</small>
                </NavLink>;
              })}
            </div>
          )}
          <NavLink to="/learn">← Back to curriculum</NavLink>
        </section>
      )}

      <div className={styles.phaseList}>
        {curriculum.phases.map((phase) => (
          <PhaseAccordion
            key={phase.id}
            phase={phase}
            allLevels={allLevels}
            passed={passedLevels}
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
  allLevels,
  passed,
  expanded,
  onToggle,
}: {
  phase: CurriculumPhase;
  allLevels: LevelMeta[];
  passed: ReadonlySet<string>;
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
                {week.modules.map((mod) => {
                  const levels = allLevels.filter((level) => level.module === mod);
                  const done = levels.filter((level) => passed.has(level.id)).length;
                  return (
                    <NavLink
                      key={mod}
                      to={`/learn/module/${mod}`}
                      className={styles.moduleLink}
                    >
                      <span className={styles.moduleDot} />
                      <span>{formatModuleName(mod)}</span>
                      <small>{levels.length === 0 ? 'Coming soon' : `${done}/${levels.length} levels`}</small>
                    </NavLink>
                  );
                })}
              </div>
            </div>
          ))}
          {phase.project && (
            <div className={styles.projectBadge}>
              🏗️ Project checkpoint:{' '}
              {allLevels.some((level) => level.id === phase.project)
                ? <NavLink to={`/level/${phase.project}`}><strong>{allLevels.find((level) => level.id === phase.project)?.title}</strong></NavLink>
                : <strong>{phase.project}</strong>}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
