import { Fragment, useCallback, useEffect, useRef, useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useLevelSubmission } from '../hooks/useLevelSubmission';
import type { LevelMeta } from '../lib/content-loader';
import { loadStarterText, useAiClient } from '../lib/craft-workspace';
import { askPersona, createRoleplayState, gradeRoleplayLevel, maxTurns, parsePersona, rephraseReply, type Persona, type RoleplayState } from '../lib/roleplay-engine';
import { loadWorkspaceFiles, saveWorkspaceFiles } from '../lib/virtual-files';
import { countWords } from '../lib/writing-grader';
import CheckResultsPanel from './CheckResultsPanel';
import { ResetControl, RubricPanel, RubricScores, SelfReview } from './CraftWorkspaceParts';
import styles from './WritingWorkspace.module.css';
import { useSubmitShortcut, submitButtonProps } from '../hooks/useSubmitShortcut';

interface Props { level: LevelMeta; hintsUsed: number; onPassed: () => void }

const META_KEY = '__fde_roleplay_meta__';
const NOTES = 'notes.md';
interface RoleplayMeta { state: RoleplayState; ticks: Record<string, boolean[]>; aiMode: boolean }
const freshMeta = (): RoleplayMeta => ({ state: createRoleplayState(), ticks: {}, aiMode: false });

export default function RoleplayWorkspace({ level, hintsUsed, onPassed }: Props) {
  const { user } = useAuth();
  const fileKey = (user?.id ?? 'guest') + ':' + level.id + ':roleplay';
  const { submit, status, passStats, results, clearResults, setStatus } = useLevelSubmission({ levelId: level.id, hintsUsed, onPassed });
  const ai = useAiClient();
  const [ready, setReady] = useState(false);
  const [loadError, setLoadError] = useState('');
  const [persona, setPersona] = useState<Persona | null>(null);
  const [starter, setStarter] = useState<Record<string, string>>({});
  const [files, setFiles] = useState<Record<string, string>>({});
  const [meta, setMeta] = useState<RoleplayMeta>(freshMeta);
  const [question, setQuestion] = useState('');
  const [thinking, setThinking] = useState(false);
  const [grading, setGrading] = useState(false);
  const logRef = useRef<HTMLDivElement>(null);
  const saveTimer = useRef<number | undefined>(undefined);
  const latest = useRef({ files, meta });
  latest.current = { files, meta };

  useEffect(() => {
    let active = true;
    async function hydrate() {
      setReady(false);
      setLoadError('');
      const initial: Record<string, string> = {};
      for (const file of level.starter_files ?? []) initial[file.path] = await loadStarterText(level, file);
      initial[NOTES] ??= '# Interview notes\n\n## Problem\n\n## Current workflow\n\n## Numbers\n\n## Constraints\n';
      let parsedPersona: Persona;
      try {
        parsedPersona = parsePersona(initial['persona.json'] ?? '');
      } catch (error) {
        if (active) { setLoadError(`This level's persona could not be loaded: ${(error as Error).message}`); setReady(true); }
        return;
      }
      const stored = await loadWorkspaceFiles(fileKey, initial);
      if (!active) return;
      const { [META_KEY]: rawMeta, ...restored } = stored;
      let parsedMeta = freshMeta();
      if (rawMeta) { try { parsedMeta = { ...parsedMeta, ...JSON.parse(rawMeta) as Partial<RoleplayMeta> }; } catch { /* keep a fresh meeting */ } }
      setPersona(parsedPersona);
      setStarter(initial);
      setFiles({ ...restored, 'persona.json': initial['persona.json'] ?? '' });
      setMeta(parsedMeta);
      setReady(true);
    }
    void hydrate();
    return () => { active = false; };
  }, [fileKey, level]);

  const persist = useCallback((nextFiles: Record<string, string>, nextMeta: RoleplayMeta, immediate = false) => {
    window.clearTimeout(saveTimer.current);
    const write = () => { saveTimer.current = undefined; void saveWorkspaceFiles(fileKey, { ...nextFiles, [META_KEY]: JSON.stringify(nextMeta) }); };
    if (immediate) write();
    else saveTimer.current = window.setTimeout(write, 400);
  }, [fileKey]);

  useEffect(() => () => {
    if (saveTimer.current === undefined) return;
    window.clearTimeout(saveTimer.current);
    void saveWorkspaceFiles(fileKey, { ...latest.current.files, [META_KEY]: JSON.stringify(latest.current.meta) });
  }, [fileKey]);

  useEffect(() => {
    logRef.current?.scrollTo({ top: logRef.current.scrollHeight });
  }, [meta.state.turns.length]);

  const updateMeta = (next: RoleplayMeta, immediate = false) => {
    setMeta(next);
    persist(latest.current.files, next, immediate);
    clearResults();
  };

  const ask = async () => {
    if (!persona || thinking) return;
    const text = question.trim();
    if (!text) return;
    const { state, turn } = askPersona(persona, meta.state, text);
    if (!turn) return;
    setQuestion('');
    let next: RoleplayMeta = { ...meta, state };
    updateMeta(next, true);
    if (meta.aiMode && ai) {
      setThinking(true);
      try {
        const aiReply = await rephraseReply(ai, persona, turn);
        const turns = [...state.turns];
        turns[turns.length - 1] = { ...turn, aiReply };
        next = { ...next, state: { ...state, turns } };
        updateMeta(next, true);
      } catch {
        setStatus('AI persona mode could not reply, so the scripted answer is shown.');
      } finally {
        setThinking(false);
      }
    }
  };

  const editNotes = (value: string) => {
    const next = { ...files, [NOTES]: value };
    setFiles(next);
    persist(next, meta);
    clearResults();
  };

  const toggleTick = (key: string, item: number, value: boolean) => {
    const list = [...(meta.ticks[key] ?? [])];
    list[item] = value;
    updateMeta({ ...meta, ticks: { ...meta.ticks, [key]: list } });
  };

  const reset = () => {
    const nextMeta = freshMeta();
    setFiles(starter);
    setMeta(nextMeta);
    persist(starter, nextMeta, true);
    clearResults();
    setStatus('The meeting has been reset. Your notes are back to the template.');
  };

  const handleSubmit = async () => {
    setGrading(true);
    try {
      const learnerFiles = { ...files };
      delete learnerFiles['persona.json'];
      const transcript = meta.state.turns.map((turn) => `Q: ${turn.question}\nA: ${turn.reply}`).join('\n\n');
      const graded = await gradeRoleplayLevel(level.checks, meta.state, { files: { ...learnerFiles, 'transcript.md': transcript }, ticks: meta.ticks, now: Date.now(), ai });
      await submit(graded);
    } finally {
      setGrading(false);
    }
  };

  useSubmitShortcut(handleSubmit, !grading);
  if (!ready) return <div className={styles.loading}>Setting up the meeting…</div>;
  if (loadError || !persona) return <div className={styles.loading} role="alert">{loadError || 'Persona missing.'}</div>;

  const limit = maxTurns(persona);
  const { turns, uncovered, ended, leadingCount } = meta.state;
  const inputId = `roleplay-question-${level.id}`;
  const notesId = `roleplay-notes-${level.id}`;

  return (
    <section className={styles.workspace} aria-label="Discovery roleplay workspace">
      <div className={styles.toolbar}>
        <strong>Discovery call</strong>
        <span className={styles.wordCount}>Turn {turns.length} of {limit}</span>
        <button type="button" className="btn btn-primary" {...submitButtonProps} onClick={() => void handleSubmit()} disabled={grading} aria-busy={grading}>{grading ? 'Checking…' : 'Submit'}</button>
      </div>

      <div className={styles.persona}>
        <h3>{persona.name}</h3>
        <p>{persona.role}{persona.company && `, ${persona.company}`}</p>
        <div className={styles.stats} aria-label="Interview progress">
          <span className={`${styles.chip} ${uncovered.length ? styles.chipGood : ''}`}>{uncovered.length} {uncovered.length === 1 ? 'fact' : 'facts'} uncovered</span>
          <span className={styles.chip}>{leadingCount} leading/closed</span>
        </div>
      </div>

      <div className={styles.chatLayout}>
        <div className={styles.chat}>
          <div className={styles.log} ref={logRef} role="log" aria-live="polite" aria-label={`Conversation with ${persona.name}`} tabIndex={0}>
            <p className={`${styles.bubble} ${styles.them}`}><span className={styles.who}>{persona.name}</span>{persona.opening}</p>
            {turns.map((turn, index) => (
              <Fragment key={index}>
                <p className={`${styles.bubble} ${styles.me}`}><span className={styles.who}>You</span>{turn.question}</p>
                {turn.coaching && <p className={styles.coach}><span aria-hidden="true">⚑ </span><span className="sr-only">Coaching: </span>{turn.coaching}</p>}
                <p className={`${styles.bubble} ${styles.them}`}>
                  <span className={styles.who}>{persona.name}</span>
                  {meta.aiMode && turn.aiReply ? turn.aiReply : turn.reply}
                  {turn.factId && <span className={styles.fact}>New fact noted: {turn.factId}</span>}
                </p>
              </Fragment>
            ))}
            {thinking && <p className={`${styles.bubble} ${styles.them}`}>…</p>}
          </div>
          <form className={styles.ask} onSubmit={(event) => { event.preventDefault(); void ask(); }}>
            <label htmlFor={inputId} className="sr-only">Your question for {persona.name}</label>
            <textarea
              id={inputId}
              rows={2}
              value={question}
              disabled={ended}
              placeholder={ended ? 'The meeting has ended. Finish your notes and submit.' : 'Ask an open question… (Enter to send, Shift+Enter for a new line)'}
              onChange={(event) => setQuestion(event.target.value)}
              onKeyDown={(event) => { if (event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); void ask(); } }}
            />
            <button type="submit" className="btn btn-secondary" disabled={ended || thinking || !question.trim()}>Ask</button>
          </form>
          {ai && (
            <label className={styles.aiToggle} style={{ padding: '0 .85rem .5rem' }}>
              <input type="checkbox" checked={meta.aiMode} onChange={(event) => updateMeta({ ...meta, aiMode: event.target.checked })} />
              AI persona mode ({ai.label}): replies sound more natural. Grading stays the same.
            </label>
          )}
        </div>

        <div className={styles.notes}>
          <label htmlFor={notesId}>Your notes (notes.md)</label>
          <textarea id={notesId} value={files[NOTES] ?? ''} onChange={(event) => editNotes(event.target.value)} spellCheck />
          <span className={styles.muted}>{countWords(files[NOTES] ?? '')} words · saved in this browser as you type.</span>
        </div>
      </div>

      <div className={styles.side}>
        <SelfReview checks={level.checks} ticks={meta.ticks} onToggle={toggleTick} idPrefix={level.id} />
        <RubricPanel checks={level.checks} ai={ai} />
        <div className={styles.footerRow}>
          <span className={styles.muted}>Never paste real customer data here. This persona is fictional.</span>
          <ResetControl onReset={reset} label="Reset level" />
        </div>
      </div>

      <RubricScores results={results} />
      <CheckResultsPanel results={results} status={status} stats={passStats} />
    </section>
  );
}
