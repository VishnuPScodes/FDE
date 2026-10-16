import { useEffect, useState, useCallback } from 'react';
import { lazy, Suspense } from 'react';
import { useParams, useNavigate, NavLink } from 'react-router-dom';
import { loadLevel, loadLesson } from '../lib/content-loader';
import type { LevelMeta } from '../lib/content-loader';
import LessonRenderer from '../components/LessonRenderer';
import styles from './LevelPage.module.css';

const PythonWorkspace = lazy(() => import('../components/PythonWorkspace'));
const SqlWorkspace = lazy(() => import('../components/SqlWorkspace'));
const ShellWorkspace = lazy(() => import('../components/ShellWorkspace'));
const GitWorkspace = lazy(() => import('../components/GitWorkspace'));
const HttpWorkspace = lazy(() => import('../components/HttpWorkspace'));

export default function LevelPage() {
  const { levelId } = useParams<{ levelId: string }>();
  const navigate = useNavigate();
  const [level, setLevel] = useState<LevelMeta | null>(null);
  const [lesson, setLesson] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [hintsRevealed, setHintsRevealed] = useState(0);
  const [passed, setPassed] = useState(false);
  const [splitPos, setSplitPos] = useState(50); // percentage for left pane

  useEffect(() => {
    if (!levelId) return;

    const load = async () => {
      setLoading(true);
      setError(null);
      setLevel(null);
      setLesson(null);
      setHintsRevealed(0);
      setPassed(false);
      try {
        const levelData = await loadLevel(levelId);
        setLevel(levelData);

        // Load lesson if referenced
        if (levelData.lesson) {
          // Resolve relative path from level directory
          const lessonPath = resolveRelativePath(levelId, levelData.lesson);
          const lessonMd = await loadLesson(lessonPath);
          setLesson(lessonMd);
        }
      } catch (err) {
        setError((err as Error).message);
      }
      setLoading(false);
    };

    void load();
  }, [levelId]);

  const markPassed = useCallback(() => setPassed(true), []);
  const revealNextHint = useCallback(() => {
    if (level && hintsRevealed < level.hints.length) {
      setHintsRevealed((prev) => prev + 1);
    }
  }, [level, hintsRevealed]);

  // ─── Resizable splitter ──────────────────────────────────────────────

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    const startX = e.clientX;
    const startPos = splitPos;

    const handleMouseMove = (moveEvent: MouseEvent) => {
      const container = document.getElementById('level-workspace');
      if (!container) return;
      const rect = container.getBoundingClientRect();
      const delta = moveEvent.clientX - startX;
      const newPos = startPos + (delta / rect.width) * 100;
      setSplitPos(Math.min(Math.max(newPos, 25), 75));
    };

    const handleMouseUp = () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
  }, [splitPos]);

  if (loading) {
    return (
      <div className={styles.loadingPage}>
        <div className={styles.spinner} />
        <span>Loading level...</span>
      </div>
    );
  }

  if (error || !level) {
    return (
      <div className={styles.errorPage}>
        <h2>Could not load level</h2>
        <p>{error ?? 'Level not found'}</p>
        <button className="btn btn-secondary" onClick={() => navigate('/learn')}>
          Back to curriculum
        </button>
      </div>
    );
  }

  return (
    <div className={styles.page}>
      {/* Level header bar */}
      <div className={styles.levelHeader}>
        <button className={styles.backBtn} onClick={() => navigate('/learn')} aria-label="Back">
          ←
        </button>
        <div className={styles.levelInfo}>
          <span className={styles.levelId}>{level.id}</span>
          <h2 className={styles.levelTitle}>{level.title}</h2>
        </div>
        <div className={styles.levelMeta}>
          <span className={`badge badge-brand`}>{level.type}</span>
          <span className={styles.difficulty}>
            {'★'.repeat(level.difficulty)}
            {'☆'.repeat(5 - level.difficulty)}
          </span>
          <span className={styles.time}>~{level.estimated_minutes} min</span>
        </div>
      </div>

      {/* Split pane workspace */}
      <div className={styles.workspace} id="level-workspace">
        {/* Left: Lesson + Task */}
        <div className={styles.leftPane} style={{ width: `${splitPos}%` }}>
          <div className={styles.leftPaneContent}>
            {/* Task description */}
            <div className={styles.taskSection}>
              <h3 className={styles.sectionLabel}>Task</h3>
              <div className={styles.taskContent}>
                <LessonRenderer markdown={level.task} />
              </div>
            </div>

            {/* Lesson content */}
            {lesson && (
              <div className={styles.lessonSection}>
                <h3 className={styles.sectionLabel}>Lesson</h3>
                <LessonRenderer markdown={lesson} />
              </div>
            )}

            {/* Hints */}
            <div className={styles.hintsSection}>
              <h3 className={styles.sectionLabel}>
                Hints ({hintsRevealed}/{level.hints.length})
              </h3>
              {level.hints.slice(0, hintsRevealed).map((hint, idx) => (
                <div key={idx} className={styles.hint}>
                  <span className={styles.hintNumber}>{idx + 1}</span>
                  <LessonRenderer markdown={hint} />
                </div>
              ))}
              {hintsRevealed < level.hints.length && (
                <button className="btn btn-ghost" onClick={revealNextHint}>
                  💡 Reveal hint {hintsRevealed + 1}
                </button>
              )}
            </div>
          </div>
        </div>

        {/* Splitter */}
        <div className={styles.splitter} role="separator" aria-orientation="vertical" aria-label="Resize lesson and workspace panes" tabIndex={0} onMouseDown={handleMouseDown}>
          <div className={styles.splitterHandle} />
        </div>

        {/* Right: lazy-loaded level workspace */}
        <div className={styles.rightPane} style={{ width: `${100 - splitPos}%` }}>
          {level.environment === 'python' && level.type === 'code' ? (
            <Suspense fallback={<div className={styles.editorPlaceholder}>Loading editor…</div>}>
              <PythonWorkspace level={level} hintsUsed={hintsRevealed} onPassed={markPassed} />
            </Suspense>
          ) : level.environment === 'sql' && level.type === 'sql' ? (
            <Suspense fallback={<div className={styles.editorPlaceholder}>Loading SQL environment…</div>}>
              <SqlWorkspace level={level} hintsUsed={hintsRevealed} onPassed={markPassed} />
            </Suspense>
          ) : level.environment === 'shell' && level.type === 'terminal' ? (
            <Suspense fallback={<div className={styles.editorPlaceholder}>Loading Linux shell…</div>}>
              <ShellWorkspace level={level} hintsUsed={hintsRevealed} onPassed={markPassed} />
            </Suspense>
          ) : level.environment === 'git' && level.type === 'terminal' ? (
            <Suspense fallback={<div className={styles.editorPlaceholder}>Loading Git workspace…</div>}>
              <GitWorkspace level={level} hintsUsed={hintsRevealed} onPassed={markPassed} />
            </Suspense>
          ) : level.environment === 'http' && (level.type === 'console' || level.type === 'terminal') ? (
            <Suspense fallback={<div className={styles.editorPlaceholder}>Loading mock API client…</div>}>
              <HttpWorkspace level={level} hintsUsed={hintsRevealed} onPassed={markPassed} />
            </Suspense>
          ) : <div className={styles.editorPlaceholder}><span className={styles.editorIcon}>⌨️</span><h3>Workspace coming soon</h3><p>Environment: <code>{level.environment}</code> · Type: <code>{level.type}</code></p></div>}
        </div>
      </div>
      {passed && level.unlocks?.[0] && <div className={styles.nextLevel}><span>Level passed</span><NavLink className="btn btn-primary" to={`/level/${level.unlocks[0]}`}>Continue to next level →</NavLink></div>}
    </div>
  );
}

/**
 * Resolve a relative lesson path from a level ID.
 * Example: levelId = "p0-w01-py-001", lesson = "../../lessons/01-printing.md"
 * → "phases/phase-0-foundations/week-01/lessons/01-printing.md"
 */
function resolveRelativePath(levelId: string, relativePath: string): string {
  const match = levelId.match(/^p(\d)-w(\d{2})-/);
  if (!match) return relativePath;

  const phase = parseInt(match[1]!, 10);
  const week = match[2]!;

  const PHASE_NAMES: Record<number, string> = {
    0: 'phase-0-foundations',
    1: 'phase-1-backend',
    2: 'phase-2-cloud',
    3: 'phase-3-ai',
    4: 'phase-4-customer',
    5: 'phase-5-capstone',
    6: 'phase-6-interview',
  };

  const phaseName = PHASE_NAMES[phase] ?? `phase-${phase}`;
  const basePath = `phases/${phaseName}/week-${week}/levels/${levelId}`;

  // Resolve ../.. etc.
  const parts = basePath.split('/');
  const relParts = relativePath.split('/');

  for (const part of relParts) {
    if (part === '..') {
      parts.pop();
    } else if (part !== '.') {
      parts.push(part);
    }
  }

  return parts.join('/');
}
