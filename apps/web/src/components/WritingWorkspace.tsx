import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import CodeEditor from './CodeEditor';
import { useAuth } from '../contexts/AuthContext';
import { useLevelSubmission } from '../hooks/useLevelSubmission';
import type { LevelMeta } from '../lib/content-loader';
import { loadStarterText, useAiClient } from '../lib/craft-workspace';
import { loadWorkspaceFiles, saveWorkspaceFiles } from '../lib/virtual-files';
import { countWords, gradeWritingLevel, levelTimeLimit } from '../lib/writing-grader';
import CheckResultsPanel from './CheckResultsPanel';
import { ResetControl, RubricPanel, RubricScores, SelfReview } from './CraftWorkspaceParts';
import LessonRenderer from './LessonRenderer';
import styles from './WritingWorkspace.module.css';
import { useSubmitShortcut, submitButtonProps } from '../hooks/useSubmitShortcut';

interface Props { level: LevelMeta; hintsUsed: number; onPassed: () => void }

const META_KEY = '__fde_writing_meta__';
interface WritingMeta { ticks: Record<string, boolean[]>; timerStartedAt: number | null }

function formatClock(totalSeconds: number): string {
  const safe = Math.max(0, Math.ceil(totalSeconds));
  return `${String(Math.floor(safe / 60)).padStart(2, '0')}:${String(safe % 60).padStart(2, '0')}`;
}

export default function WritingWorkspace({ level, hintsUsed, onPassed }: Props) {
  const { user } = useAuth();
  const fileKey = (user?.id ?? 'guest') + ':' + level.id + ':writing';
  const { submit, status, passStats, results, clearResults, setStatus } = useLevelSubmission({ levelId: level.id, hintsUsed, onPassed });
  const ai = useAiClient();
  const [ready, setReady] = useState(false);
  const [files, setFiles] = useState<Record<string, string>>({});
  const [starter, setStarter] = useState<Record<string, string>>({});
  const [activeFile, setActiveFile] = useState('answer.md');
  const [primaryFile, setPrimaryFile] = useState('answer.md');
  const [meta, setMeta] = useState<WritingMeta>({ ticks: {}, timerStartedAt: null });
  const [view, setView] = useState<'write' | 'preview'>('write');
  const [grading, setGrading] = useState(false);
  const [now, setNow] = useState(Date.now());
  const saveTimer = useRef<number | undefined>(undefined);
  const latest = useRef({ files, meta });
  latest.current = { files, meta };

  const timeLimit = useMemo(() => levelTimeLimit(level.checks) ?? (level.timed ? { seconds: 45 * 60, advisory: true } : null), [level.checks, level.timed]);
  const isDrill = level.type === 'decomposition' || Boolean(timeLimit);

  useEffect(() => {
    let active = true;
    async function hydrate() {
      setReady(false);
      const initial: Record<string, string> = {};
      for (const file of level.starter_files ?? []) initial[file.path] = await loadStarterText(level, file);
      if (!Object.keys(initial).length) initial['answer.md'] = '';
      const stored = await loadWorkspaceFiles(fileKey, initial);
      if (!active) return;
      const { [META_KEY]: rawMeta, ...restored } = stored;
      let parsed: WritingMeta = { ticks: {}, timerStartedAt: null };
      if (rawMeta) { try { parsed = { ...parsed, ...JSON.parse(rawMeta) as Partial<WritingMeta> }; } catch { /* keep defaults */ } }
      setStarter(initial);
      setFiles(restored);
      setMeta(parsed);
      const first = Object.keys(initial).find((path) => /\.md$/i.test(path)) ?? Object.keys(initial)[0] ?? 'answer.md';
      setActiveFile(first);
      setPrimaryFile(first);
      setReady(true);
    }
    void hydrate();
    return () => { active = false; };
  }, [fileKey, level]);

  const persist = useCallback((nextFiles: Record<string, string>, nextMeta: WritingMeta) => {
    window.clearTimeout(saveTimer.current);
    saveTimer.current = window.setTimeout(() => {
      saveTimer.current = undefined;
      void saveWorkspaceFiles(fileKey, { ...nextFiles, [META_KEY]: JSON.stringify(nextMeta) });
    }, 400);
  }, [fileKey]);

  // Flush a pending autosave when the learner leaves the level.
  useEffect(() => () => {
    if (saveTimer.current === undefined) return;
    window.clearTimeout(saveTimer.current);
    void saveWorkspaceFiles(fileKey, { ...latest.current.files, [META_KEY]: JSON.stringify(latest.current.meta) });
  }, [fileKey]);

  useEffect(() => {
    if (!meta.timerStartedAt) return;
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, [meta.timerStartedAt]);

  const editFile = (value: string) => {
    const next = { ...files, [activeFile]: value };
    setFiles(next);
    persist(next, meta);
    clearResults();
  };

  const updateMeta = (next: WritingMeta) => {
    setMeta(next);
    persist(latest.current.files, next);
    clearResults();
  };

  const toggleTick = (key: string, item: number, value: boolean) => {
    const list = [...(meta.ticks[key] ?? [])];
    list[item] = value;
    updateMeta({ ...meta, ticks: { ...meta.ticks, [key]: list } });
  };

  const startTimer = () => { setNow(Date.now()); updateMeta({ ...meta, timerStartedAt: Date.now() }); setStatus('Timer started. Think out loud, keep moving, and submit before it hits zero.'); };

  const reset = () => {
    const nextMeta: WritingMeta = { ticks: {}, timerStartedAt: null };
    setFiles(starter);
    setMeta(nextMeta);
    window.clearTimeout(saveTimer.current);
    saveTimer.current = undefined;
    void saveWorkspaceFiles(fileKey, { ...starter, [META_KEY]: JSON.stringify(nextMeta) });
    clearResults();
    setStatus('Level reset to the starter template.');
  };

  const handleSubmit = async () => {
    setGrading(true);
    try {
      const graded = await gradeWritingLevel(level.checks, { files, defaultFile: primaryFile, ticks: meta.ticks, timerStartedAt: meta.timerStartedAt, now: Date.now(), ai });
      await submit(graded);
    } finally {
      setGrading(false);
    }
  };

  useSubmitShortcut(handleSubmit, !grading);
  if (!ready) return <div className={styles.loading}>Opening your draft…</div>;

  const text = files[activeFile] ?? '';
  const words = countWords(text);
  const wordCheck = level.checks.find((check) => check.kind === 'sim_state' && check.path === 'word_count');
  const wordTarget = wordCheck ? [wordCheck.min, wordCheck.max].filter((value): value is number => value !== undefined).join('–') : '';
  const remaining = timeLimit && meta.timerStartedAt ? timeLimit.seconds - (now - meta.timerStartedAt) / 1000 : null;
  const editableFiles = Object.keys(files);

  return (
    <section className={styles.workspace} aria-label={isDrill ? 'Decomposition drill workspace' : 'Writing workspace'}>
      <div className={styles.toolbar}>
        <strong>{isDrill ? 'Decomposition drill' : 'Writing desk'}</strong>
        <span className={styles.wordCount} aria-live="off">{words} words{wordTarget && ` · target ${wordTarget}`}</span>
        <button type="button" className="btn btn-primary" {...submitButtonProps} onClick={() => void handleSubmit()} disabled={grading} aria-busy={grading}>{grading ? 'Checking…' : 'Submit'}</button>
      </div>

      {timeLimit && (
        <div className={styles.timer}>
          {meta.timerStartedAt === null ? (
            <>
              <span>Time box: {Math.round(timeLimit.seconds / 60)} minutes{timeLimit.advisory ? ' (advisory)' : ''}.</span>
              <button type="button" className="btn btn-secondary" onClick={startTimer}>Start timer</button>
            </>
          ) : (
            <>
              <span role="timer" aria-label="Time remaining" className={remaining !== null && remaining <= 0 ? styles.overtime : remaining !== null && remaining < 300 ? styles.warning : ''}>
                {remaining !== null && remaining > 0 ? `${formatClock(remaining)} left` : `Time is up${timeLimit.advisory ? ' (advisory)' : ''} · ${formatClock(-(remaining ?? 0))} over`}
              </span>
              <span className="sr-only" aria-live="polite">{remaining !== null && remaining <= 0 ? 'Time is up.' : remaining !== null && remaining < 300 && remaining > 299 ? 'Five minutes left.' : ''}</span>
              <button type="button" className="btn btn-ghost" onClick={() => updateMeta({ ...meta, timerStartedAt: Date.now() })}>Restart timer</button>
            </>
          )}
        </div>
      )}

      <div className={styles.editorBar}>
        {editableFiles.length > 1 ? (
          <>
            <label htmlFor={`writing-file-${level.id}`}>File</label>
            <select id={`writing-file-${level.id}`} value={activeFile} onChange={(event) => setActiveFile(event.target.value)}>
              {editableFiles.map((file) => <option key={file} value={file}>{file}</option>)}
            </select>
          </>
        ) : <span className={styles.fileName}>{activeFile}</span>}
        <div className={styles.viewToggle} role="group" aria-label="Editor view">
          <button type="button" aria-pressed={view === 'write'} onClick={() => setView('write')}>Write</button>
          <button type="button" aria-pressed={view === 'preview'} onClick={() => setView('preview')}>Preview</button>
        </div>
      </div>

      <div className={styles.panes} data-view={view}>
        <CodeEditor className={styles.editor} ariaLabel={`Edit ${activeFile} in Markdown`} path={activeFile} value={text} onChange={editFile} spellCheck minHeight={288} />
        <div className={styles.preview} aria-label="Preview" tabIndex={0}>
          {/\.md$/i.test(activeFile) ? <LessonRenderer markdown={text || '_Nothing written yet._'} /> : <pre>{text}</pre>}
        </div>
      </div>

      <div className={styles.side}>
        <SelfReview checks={level.checks} ticks={meta.ticks} onToggle={toggleTick} idPrefix={level.id} />
        <RubricPanel checks={level.checks} ai={ai} />
        <div className={styles.footerRow}>
          <span className={styles.muted}>Saved in this browser as you type.</span>
          <ResetControl onReset={reset} />
        </div>
      </div>

      <RubricScores results={results} />
      <CheckResultsPanel results={results} status={status} stats={passStats} />
    </section>
  );
}
