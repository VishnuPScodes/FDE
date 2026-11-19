import { useEffect, useMemo, useState } from 'react';
import { NavLink } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { loadAllLevels, loadCurriculum } from '../lib/content-loader';
import type { Curriculum, LevelMeta } from '../lib/content-loader';
import { getLocalProgress, getProgress } from '../lib/progress';
import type { ProgressRow } from '../lib/progress';
import { isLevelUnlocked } from '../lib/unlocks';
import styles from './DashboardPage.module.css';

const PHASE_STYLE: Record<number, { icon: string; color: string }> = {
  0: { icon: '⚡', color: '#5568f8' },
  1: { icon: '🔌', color: '#a855f7' },
  2: { icon: '☁️', color: '#06b6d4' },
  3: { icon: '🤖', color: '#22c55e' },
  4: { icon: '🤝', color: '#f59e0b' },
  5: { icon: '🚀', color: '#ef4444' },
  6: { icon: '🎯', color: '#ec4899' },
};

/** Consecutive days (ending today or yesterday) with at least one pass. */
export function dayStreak(rows: ProgressRow[], now = new Date()): number {
  const days = new Set(rows.filter((row) => row.passed_at).map((row) => new Date(row.passed_at!).toDateString()));
  const cursor = new Date(now);
  if (!days.has(cursor.toDateString())) cursor.setDate(cursor.getDate() - 1);
  let streak = 0;
  while (days.has(cursor.toDateString())) {
    streak += 1;
    cursor.setDate(cursor.getDate() - 1);
  }
  return streak;
}

function formatDuration(seconds: number): string {
  if (seconds < 3600) return `${Math.round(seconds / 60)}m`;
  return `${(seconds / 3600).toFixed(1)}h`;
}

export default function DashboardPage() {
  const { profile, session } = useAuth();
  const [curriculum, setCurriculum] = useState<Curriculum | null>(null);
  const [levels, setLevels] = useState<LevelMeta[]>([]);
  const [rows, setRows] = useState<ProgressRow[]>(() => getLocalProgress());

  useEffect(() => {
    void loadCurriculum().then(setCurriculum).catch(() => setCurriculum(null));
    void loadAllLevels().then(setLevels).catch(() => setLevels([]));
  }, []);

  useEffect(() => {
    if (!session?.access_token) return;
    void getProgress(session.access_token).then(setRows).catch(() => undefined);
  }, [session?.access_token]);

  const firstName = (profile?.full_name as string | null | undefined)?.split(' ')[0] ?? 'Learner';
  const passed = useMemo(() => new Set(rows.filter((row) => row.status === 'passed').map((row) => row.level_id)), [rows]);
  const coreLevels = levels.filter((level) => level.order < 90);
  const moduleOrder = curriculum?.phases.flatMap((phase) => phase.weeks.flatMap((week) => week.modules)) ?? [];
  const ordered = [...coreLevels].sort((a, b) => (moduleOrder.indexOf(a.module) - moduleOrder.indexOf(b.module)) || (a.order - b.order));
  const lastLevelId = (() => { try { return localStorage.getItem('fde-last-level'); } catch { return null; } })();
  const lastLevel = lastLevelId ? levels.find((level) => level.id === lastLevelId && !passed.has(level.id)) : undefined;
  const nextLevel = lastLevel ?? ordered.find((level) => !passed.has(level.id) && isLevelUnlocked(level, levels, passed, profile?.unlock_all_levels));
  const timeSpent = rows.reduce((sum, row) => sum + (row.time_spent_sec || 0), 0);
  const completed = coreLevels.filter((level) => passed.has(level.id)).length;

  return (
    <div className={styles.page}>
      <div className={styles.header}>
        <h1 className={styles.greeting}>
          Welcome back, <span className={styles.name}>{firstName}</span>
        </h1>
        <p className={styles.subtitle}>
          {completed === 0 ? 'Start with Phase 0 — your first level takes about two minutes.' : 'Pick up where you left off, or start a new phase.'}
        </p>
        {nextLevel && (
          <NavLink className="btn btn-primary" to={`/level/${nextLevel.id}`}>
            {lastLevel ? 'Resume' : completed === 0 ? 'Start' : 'Next'}: {nextLevel.title} →
          </NavLink>
        )}
      </div>

      <div className={styles.phasesGrid}>
        {(curriculum?.phases ?? []).map((phase) => {
          const weeks = phase.weeks.map((week) => week.week);
          const modules = new Set(phase.weeks.flatMap((week) => week.modules));
          const phaseLevels = coreLevels.filter((level) => modules.has(level.module));
          const done = phaseLevels.filter((level) => passed.has(level.id)).length;
          const progress = phaseLevels.length ? Math.round((done / phaseLevels.length) * 100) : 0;
          const style = PHASE_STYLE[phase.id] ?? { icon: '📘', color: '#5568f8' };
          return (
            <NavLink key={phase.id} to="/learn" className={styles.phaseCard} style={{ '--phase-color': style.color } as React.CSSProperties}>
              <div className={styles.phaseCardTop}>
                <span className={styles.phaseEmoji} aria-hidden="true">{style.icon}</span>
                <div>
                  <span className={styles.phaseLabel}>Phase {phase.id}</span>
                  <h3 className={styles.phaseTitle}>{phase.title}</h3>
                </div>
              </div>
              <div className={styles.progressBar} role="progressbar" aria-valuenow={progress} aria-valuemin={0} aria-valuemax={100} aria-label={`${phase.title} progress`}>
                <div className={styles.progressFill} style={{ width: `${progress}%` }} />
              </div>
              <div className={styles.phaseCardBottom}>
                <span className={styles.progressText}>{done}/{phaseLevels.length} levels · {progress}%</span>
                <span className={styles.weekRange}>Weeks {Math.min(...weeks)}–{Math.max(...weeks)}</span>
              </div>
            </NavLink>
          );
        })}
      </div>

      <div className={styles.statsRow}>
        <div className={styles.statCard}>
          <span className={styles.statValue}>{completed}</span>
          <span className={styles.statLabel}>Levels completed</span>
        </div>
        <div className={styles.statCard}>
          <span className={styles.statValue}>{formatDuration(timeSpent)}</span>
          <span className={styles.statLabel}>Time spent</span>
        </div>
        <div className={styles.statCard}>
          <span className={styles.statValue}>{dayStreak(rows)}</span>
          <span className={styles.statLabel}>Day streak</span>
        </div>
        <div className={styles.statCard}>
          <span className={styles.statValue}>{coreLevels.length ? Math.round((completed / coreLevels.length) * 100) : 0}%</span>
          <span className={styles.statLabel}>Course complete</span>
        </div>
      </div>
    </div>
  );
}
