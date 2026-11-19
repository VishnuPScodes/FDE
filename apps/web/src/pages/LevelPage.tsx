import { useEffect, useState, useCallback } from 'react';
import { formatModuleName } from '../lib/format';
import LevelFeedback from '../components/LevelFeedback';
import { lazy, Suspense } from 'react';
import { useParams, useNavigate, NavLink } from 'react-router-dom';
import { loadAllLevels, loadCurriculum, loadLevel, loadLesson } from '../lib/content-loader';
import type { LevelMeta } from '../lib/content-loader';
import { useAuth } from '../contexts/AuthContext';
import { getLocalProgress, getProgress } from '../lib/progress';
import { isLevelUnlocked, prerequisitesFor } from '../lib/unlocks';
import LessonRenderer from '../components/LessonRenderer';
import styles from './LevelPage.module.css';

const PythonWorkspace = lazy(() => import('../components/PythonWorkspace'));
const SqlWorkspace = lazy(() => import('../components/SqlWorkspace'));
const ShellWorkspace = lazy(() => import('../components/ShellWorkspace'));
const GitWorkspace = lazy(() => import('../components/GitWorkspace'));
const HttpWorkspace = lazy(() => import('../components/HttpWorkspace'));
const OAuthWorkspace = lazy(() => import('../components/OAuthWorkspace'));
const SecurityQuizWorkspace = lazy(() => import('../components/SecurityQuizWorkspace'));
const TsWorkspace = lazy(() => import('../components/TsWorkspace'));
const DockerWorkspace = lazy(() => import('../components/DockerWorkspace'));
const AiWorkspace = lazy(() => import('../components/AiWorkspace'));
const WritingWorkspace = lazy(() => import('../components/WritingWorkspace'));
const RoleplayWorkspace = lazy(() => import('../components/RoleplayWorkspace'));
const ObservabilityWorkspace = lazy(() => import('../components/ObservabilityWorkspace'));
const RealWorldWorkspace = lazy(() => import('../components/RealWorldWorkspace'));
const CiWorkspace = lazy(() => import('../components/CiWorkspace'));
const AwsWorkspace = lazy(() => import('../components/AwsWorkspace'));
const TerraformWorkspace = lazy(() => import('../components/TerraformWorkspace'));
const KubernetesWorkspace = lazy(() => import('../components/KubernetesWorkspace'));

export default function LevelPage() {
  const { levelId } = useParams<{ levelId: string }>();
  const navigate = useNavigate();
  const [level, setLevel] = useState<LevelMeta | null>(null);
  const [lesson, setLesson] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [hintsRevealed, setHintsRevealed] = useState(0);
  const [passed, setPassed] = useState(false);
  const [splitPos, setSplitPos] = useState(() => {
    try {
      const saved = Number(localStorage.getItem('fde-split-pos'));
      return saved >= 25 && saved <= 75 ? saved : 50;
    } catch {
      return 50;
    }
  }); // percentage for left pane
  useEffect(() => {
    try { localStorage.setItem('fde-split-pos', String(Math.round(splitPos))); } catch { /* storage blocked */ }
  }, [splitPos]);
  const handleSplitterKey = useCallback((event: React.KeyboardEvent) => {
    const step = event.shiftKey ? 10 : 2;
    if (event.key === 'ArrowLeft') setSplitPos((pos) => Math.max(25, pos - step));
    else if (event.key === 'ArrowRight') setSplitPos((pos) => Math.min(75, pos + step));
    else if (event.key === 'Home') setSplitPos(25);
    else if (event.key === 'End') setSplitPos(75);
    else return;
    event.preventDefault();
  }, []);
  const { session, profile } = useAuth();
  const [allLevels, setAllLevels] = useState<LevelMeta[]>([]);
  const [moduleOrder, setModuleOrder] = useState<string[]>([]);
  const [passedIds, setPassedIds] = useState<Set<string>>(() => new Set(getLocalProgress().filter((row) => row.status === 'passed').map((row) => row.level_id)));
  const [openAnyway, setOpenAnyway] = useState(false);

  useEffect(() => {
    void loadAllLevels().then(setAllLevels).catch(() => setAllLevels([]));
    void loadCurriculum().then((curriculum) => setModuleOrder(curriculum.phases.flatMap((phase) => phase.weeks.flatMap((week) => week.modules)))).catch(() => setModuleOrder([]));
  }, []);

  useEffect(() => {
    if (!session?.access_token) return;
    let active = true;
    void getProgress(session.access_token)
      .then((rows) => { if (active) setPassedIds(new Set(rows.filter((row) => row.status === 'passed').map((row) => row.level_id))); })
      .catch(() => undefined);
    return () => { active = false; };
  }, [session?.access_token, levelId]);

  useEffect(() => {
    if (!levelId) return;

    const load = async () => {
      setLoading(true);
      setError(null);
      setLevel(null);
      setLesson(null);
      setHintsRevealed(0);
      setPassed(false);
      setOpenAnyway(false);
      try {
        const levelData = await loadLevel(levelId);
        setLevel(levelData);
        try {
          const savedHints = Number(localStorage.getItem(`fde-hints:${levelId}`) ?? 0);
          if (Number.isFinite(savedHints) && savedHints > 0) setHintsRevealed(Math.min(savedHints, levelData.hints.length));
        } catch { /* storage blocked */ }
        try { localStorage.setItem('fde-last-level', levelId); } catch { /* storage blocked */ }

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

  const markPassed = useCallback(() => {
    setPassed(true);
    if (levelId) setPassedIds((previous) => previous.has(levelId) ? previous : new Set(previous).add(levelId));
  }, [levelId]);
  const revealNextHint = useCallback(() => {
    if (level && hintsRevealed < level.hints.length) {
      const next = hintsRevealed + 1;
      setHintsRevealed(next);
      try { localStorage.setItem(`fde-hints:${level.id}`, String(next)); } catch { /* storage blocked */ }
    }
  }, [level, hintsRevealed]);

  // Ctrl/Cmd + ' reveals the next hint.
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key === "'") {
        event.preventDefault();
        revealNextHint();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [revealNextHint]);

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
        <button className="btn btn-secondary" onClick={() => void navigate('/learn')}>
          Back to curriculum
        </button>
      </div>
    );
  }

  const locked = allLevels.length > 0 && !openAnyway && !isLevelUnlocked(level, allLevels, passedIds, profile?.unlock_all_levels);
  const prerequisites = locked ? prerequisitesFor(level, allLevels).map((id) => allLevels.find((item) => item.id === id)).filter((item): item is LevelMeta => item !== undefined) : [];
  const nextLevel = findNextLevel(level, allLevels, moduleOrder);
  const moduleLevels = allLevels.filter((item) => item.module === level.module).sort((a, b) => a.order - b.order);
  const modulePosition = moduleLevels.findIndex((item) => item.id === level.id);
  const previousInModule = modulePosition > 0 ? moduleLevels[modulePosition - 1] : undefined;
  const nextInModule = modulePosition >= 0 ? moduleLevels[modulePosition + 1] : undefined;

  if (locked) {
    return (
      <div className={styles.errorPage}>
        <h2>🔒 {level.title} is locked</h2>
        <p>Pass {prerequisites.length === 1 ? 'this level' : 'one of these levels'} first to unlock it:</p>
        <ul className={styles.prereqList}>
          {prerequisites.map((item) => <li key={item.id}><NavLink to={`/level/${item.id}`}>{item.title}</NavLink></li>)}
        </ul>
        <div className={styles.gateActions}>
          {prerequisites[0] && <NavLink className="btn btn-primary" to={`/level/${prerequisites[0].id}`}>Go to {prerequisites[0].title}</NavLink>}
          <button className="btn btn-ghost" onClick={() => setOpenAnyway(true)}>Open anyway</button>
        </div>
      </div>
    );
  }

  return (
    <div className={styles.page}>
      {level.mobile_compatible !== true && level.type !== 'quiz' && level.type !== 'writing' && level.type !== 'roleplay' && (
        <p className={styles.mobileNotice} role="note">This level works best on a laptop or desktop. You can still read the task and lesson here.</p>
      )}
      {/* Level header bar */}
      <div className={styles.levelHeader}>
        <button className={styles.backBtn} onClick={() => void navigate('/learn')} aria-label="Back">
          ←
        </button>
        <div className={styles.levelInfo}>
          <span className={styles.levelId}>
            {modulePosition >= 0 ? `Level ${modulePosition + 1} of ${moduleLevels.length} in ${formatModuleName(level.module)}` : level.id}
          </span>
          <h2 className={styles.levelTitle}>{level.title}</h2>
        </div>
        <nav className={styles.levelNav} aria-label="Levels in this module">
          <button className={styles.backBtn} disabled={!previousInModule} onClick={() => previousInModule && void navigate(`/level/${previousInModule.id}`)} aria-label="Previous level" title={previousInModule?.title}>‹</button>
          <button className={styles.backBtn} disabled={!nextInModule} onClick={() => nextInModule && void navigate(`/level/${nextInModule.id}`)} aria-label="Next level" title={nextInModule?.title}>›</button>
        </nav>
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
                <button className="btn btn-ghost" onClick={revealNextHint} title="Shortcut: Ctrl/Cmd + '">
                  💡 Reveal hint {hintsRevealed + 1}
                </button>
              )}
            </div>
            <LevelFeedback levelId={level.id} />
          </div>
        </div>

        {/* Splitter */}
        <div className={styles.splitter} role="separator" aria-orientation="vertical" aria-label="Resize lesson and workspace panes (arrow keys)" aria-valuemin={25} aria-valuemax={75} aria-valuenow={Math.round(splitPos)} tabIndex={0} onMouseDown={handleMouseDown} onKeyDown={handleSplitterKey}>
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
              {level.module === 'oauth-oidc' || level.module === 'jwt-rbac' ? <OAuthWorkspace level={level} hintsUsed={hintsRevealed} onPassed={markPassed} /> : <HttpWorkspace level={level} hintsUsed={hintsRevealed} onPassed={markPassed} />}
            </Suspense>
          ) : level.environment === 'quiz' && level.type === 'quiz' ? (
            <Suspense fallback={<div className={styles.editorPlaceholder}>Loading security review…</div>}>
              <SecurityQuizWorkspace level={level} hintsUsed={hintsRevealed} onPassed={markPassed} />
            </Suspense>
          ) : (level.environment === 'ts' || level.environment === 'js') && level.type === 'code' ? (
            <Suspense fallback={<div className={styles.editorPlaceholder}>Loading JavaScript workspace…</div>}>
              <TsWorkspace level={level} hintsUsed={hintsRevealed} onPassed={markPassed} />
            </Suspense>
          ) : level.environment === 'docker' && level.type === 'terminal' ? (
            <Suspense fallback={<div className={styles.editorPlaceholder}>Loading Docker simulator…</div>}>
              <DockerWorkspace level={level} hintsUsed={hintsRevealed} onPassed={markPassed} />
            </Suspense>
          ) : level.environment === 'ci' || level.environment === 'aws' || level.environment === 'terraform' || level.environment === 'kubernetes' ? (
            <Suspense fallback={<div className={styles.editorPlaceholder}>Loading simulator…</div>}>
              {level.environment === 'ci' ? <CiWorkspace level={level} hintsUsed={hintsRevealed} onPassed={markPassed} />
                : level.environment === 'aws' ? <AwsWorkspace level={level} hintsUsed={hintsRevealed} onPassed={markPassed} />
                : level.environment === 'terraform' ? <TerraformWorkspace level={level} hintsUsed={hintsRevealed} onPassed={markPassed} />
                : <KubernetesWorkspace level={level} hintsUsed={hintsRevealed} onPassed={markPassed} />}
            </Suspense>
          ) : level.environment === 'ai' ? (
            <Suspense fallback={<div className={styles.editorPlaceholder}>Loading AI workspace…</div>}>
              <AiWorkspace level={level} hintsUsed={hintsRevealed} onPassed={markPassed} />
            </Suspense>
          ) : level.environment === 'writing' || level.type === 'writing' || level.type === 'decomposition' ? (
            <Suspense fallback={<div className={styles.editorPlaceholder}>Loading editor…</div>}>
              <WritingWorkspace level={level} hintsUsed={hintsRevealed} onPassed={markPassed} />
            </Suspense>
          ) : level.environment === 'roleplay' || level.type === 'roleplay' ? (
            <Suspense fallback={<div className={styles.editorPlaceholder}>Loading role-play…</div>}>
              <RoleplayWorkspace level={level} hintsUsed={hintsRevealed} onPassed={markPassed} />
            </Suspense>
          ) : level.environment === 'observability' ? (
            <Suspense fallback={<div className={styles.editorPlaceholder}>Loading observability console…</div>}>
              <ObservabilityWorkspace level={level} hintsUsed={hintsRevealed} onPassed={markPassed} />
            </Suspense>
          ) : level.environment === 'realworld' || level.type === 'realworld' ? (
            <Suspense fallback={<div className={styles.editorPlaceholder}>Loading…</div>}>
              <RealWorldWorkspace level={level} hintsUsed={hintsRevealed} onPassed={markPassed} />
            </Suspense>
          ) : <div className={styles.editorPlaceholder}><span className={styles.editorIcon}>⌨️</span><h3>Workspace coming soon</h3><p>Environment: <code>{level.environment}</code> · Type: <code>{level.type}</code></p></div>}
        </div>
      </div>
      {passed && <div className={styles.nextLevel} role="status"><span>🎉 Level passed</span>{nextLevel ? <NavLink className="btn btn-primary" to={`/level/${nextLevel.id}`}>Next: {nextLevel.title} →</NavLink> : <NavLink className="btn btn-primary" to="/learn">Back to curriculum</NavLink>}</div>}
    </div>
  );
}

/**
 * The level to suggest after passing: the first `unlocks` target, else the
 * next level in the same module, else the first level of the next module in
 * curriculum order (so weeks flow into each other).
 */
function findNextLevel(level: LevelMeta, allLevels: LevelMeta[], moduleOrder: string[]): LevelMeta | undefined {
  const byId = (id: string) => allLevels.find((item) => item.id === id);
  const unlockTarget = level.unlocks?.map(byId).find((item) => item !== undefined);
  if (unlockTarget) return unlockTarget;
  const core = (item: LevelMeta) => item.order < 90;
  const sameModule = allLevels.filter((item) => item.module === level.module && core(item) && item.order > level.order).sort((a, b) => a.order - b.order)[0];
  if (sameModule) return sameModule;
  const index = moduleOrder.indexOf(level.module);
  for (const moduleId of moduleOrder.slice(index + 1)) {
    const first = allLevels.filter((item) => item.module === moduleId && core(item)).sort((a, b) => a.order - b.order)[0];
    if (first) return first;
  }
  return undefined;
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
