import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import type { Check } from '@fde/content-schema';
import { useAuth } from '../contexts/AuthContext';
import { useTerminalInput } from '../hooks/useTerminalInput';
import { useSubmitShortcut, submitButtonProps } from '../hooks/useSubmitShortcut';
import { useLevelSubmission, type SubmissionCheckResult } from '../hooks/useLevelSubmission';
import type { LevelMeta } from '../lib/content-loader';
import { loadWorkspaceFiles, saveWorkspaceFiles } from '../lib/virtual-files';
import CheckResultsPanel from './CheckResultsPanel';
import styles from './SimTerminalWorkspace.module.css';

export interface SimState { files: Record<string, string>; history: string[] }

/** What a simulated terminal environment (Terraform, Kubernetes) provides to the shared workspace. */
export interface SimEngine<S extends SimState> {
  /** Short product name used in labels, e.g. "Terraform". */
  label: string;
  create: (files: Record<string, string>) => S;
  run: (state: S, line: string) => { state: S; stdout: string; stderr: string; exitCode: number };
  grade: (checks: Check[], state: S) => SubmissionCheckResult[];
  placeholder: string;
  /** Known command phrases for Tab completion. */
  phrases?: readonly string[];
  intro: string;
  footnote: string;
  /** Files the learner may look at but not edit. */
  readOnlyFiles?: string[];
  /** Preferred file to open first. */
  firstFile?: RegExp;
}

interface Entry { cmd: string; out: string; err: string }
interface Saved { state: Omit<SimState, 'files'>; entries: Entry[]; commands: string[] }
interface Props<S extends SimState> {
  level: LevelMeta;
  hintsUsed: number;
  onPassed: () => void;
  engine: SimEngine<S>;
  /** Storage suffix, e.g. "terraform". */
  kind: string;
  sideTitle: string;
  side: (state: S) => ReactNode;
}

const META_KEY = '__fde_sim_state__';
const MAX_ENTRIES = 60;

export default function SimTerminalWorkspace<S extends SimState>({ level, hintsUsed, onPassed, engine, kind, sideTitle, side }: Props<S>) {
  const { user } = useAuth();
  const fileKey = (user?.id ?? 'guest') + ':' + level.id + ':' + kind;
  const { submit, status, passStats, results, clearResults, setStatus } = useLevelSubmission({ levelId: level.id, hintsUsed, onPassed });
  const starter = useMemo(() => Object.fromEntries((level.starter_files ?? []).map((file) => [file.path, file.content ?? ''])), [level.starter_files]);
  const [state, setState] = useState<S | null>(null);
  const [entries, setEntries] = useState<Entry[]>([]);
  const [commands, setCommands] = useState<string[]>([]);
  const [activeFile, setActiveFile] = useState('');
  const [command, setCommand] = useState('');
  const [newFile, setNewFile] = useState('');
  const [confirmReset, setConfirmReset] = useState(false);
  const transcriptRef = useRef<HTMLDivElement>(null);

  const terminal = useTerminalInput({ value: command, setValue: setCommand, phrases: engine.phrases ?? [], files: state ? Object.keys(state.files) : [], history: commands });

  const persist = useCallback((next: S, nextEntries: Entry[], nextCommands: string[]) => {
    const { files, ...rest } = next;
    const saved: Saved = { state: rest, entries: nextEntries, commands: nextCommands };
    void saveWorkspaceFiles(fileKey, { ...files, [META_KEY]: JSON.stringify(saved) });
  }, [fileKey]);

  const pickFirst = useCallback((files: string[]) => files.find((f) => engine.firstFile?.test(f)) ?? files[0] ?? '', [engine.firstFile]);

  useEffect(() => {
    let active = true;
    setState(null);
    void loadWorkspaceFiles(fileKey, starter).then((stored) => {
      if (!active) return;
      const { [META_KEY]: meta, ...files } = stored;
      let next = engine.create(files);
      let savedEntries: Entry[] = [];
      let savedCommands: string[] = [];
      if (meta) {
        try {
          const saved = JSON.parse(meta) as Saved;
          next = { ...next, ...saved.state, files };
          savedEntries = Array.isArray(saved.entries) ? saved.entries : [];
          savedCommands = Array.isArray(saved.commands) ? saved.commands : [];
        } catch { /* Keep the starter files when saved state is unreadable. */ }
      }
      setState(next);
      setEntries(savedEntries);
      setCommands(savedCommands);
      setActiveFile(pickFirst(Object.keys(next.files)));
      setConfirmReset(false);
    });
    return () => { active = false; };
  }, [engine, fileKey, pickFirst, starter]);

  useEffect(() => {
    const box = transcriptRef.current;
    if (box) box.scrollTop = box.scrollHeight;
  }, [entries]);

  useSubmitShortcut(() => state && submit(engine.grade(level.checks, state)), !!state);
  if (!state) return <div className={styles.loading}>Starting {engine.label} simulator…</div>;

  const files = Object.keys(state.files).sort();
  const readOnly = engine.readOnlyFiles?.includes(activeFile) ?? false;

  const edit = (value: string) => {
    const next = { ...state, files: { ...state.files, [activeFile]: value } } as S;
    setState(next);
    clearResults();
    persist(next, entries, commands);
  };

  const addFile = () => {
    const name = newFile.trim();
    if (!name || name.includes('..') || name in state.files) return;
    const next = { ...state, files: { ...state.files, [name]: '' } } as S;
    setState(next);
    setActiveFile(name);
    setNewFile('');
    persist(next, entries, commands);
  };

  const execute = () => {
    const line = command.trim();
    if (!line) return;
    if (line === 'clear') { setEntries([]); setCommand(''); persist(state, [], commands); return; }
    const result = engine.run(state, line);
    const nextEntries = [...entries, { cmd: line, out: result.stdout, err: result.stderr }].slice(-MAX_ENTRIES);
    const nextCommands = [...commands, line].slice(-100);
    setState(result.state);
    setEntries(nextEntries);
    setCommands(nextCommands);
    setCommand('');
    terminal.reset();
    clearResults();
    setStatus(`Exit code ${result.exitCode}`);
    persist(result.state, nextEntries, nextCommands);
  };

  const reset = async () => {
    await saveWorkspaceFiles(fileKey, starter);
    const fresh = engine.create(starter);
    setState(fresh);
    setEntries([]);
    setCommands([]);
    setActiveFile(pickFirst(Object.keys(fresh.files)));
    setConfirmReset(false);
    clearResults();
    setStatus('Level reset. Files and terminal are back to the starting point.');
  };

  return (
    <section className={styles.workspace} aria-label={engine.label + ' simulator workspace'}>
      <div className={styles.toolbar}>
        <strong>{engine.label} · simulated, runs only in your browser</strong>
        <div className={styles.actions}>
          {confirmReset ? (
            <span className={styles.confirm}>
              Reset files and terminal?
              <button className="btn btn-secondary" onClick={() => void reset()}>Yes, reset</button>
              <button className="btn btn-secondary" onClick={() => setConfirmReset(false)}>Cancel</button>
            </span>
          ) : <button className="btn btn-secondary" onClick={() => setConfirmReset(true)}>Reset level</button>}
          <button className="btn btn-primary" {...submitButtonProps} onClick={() => void submit(engine.grade(level.checks, state))}>Submit</button>
        </div>
      </div>
      <div className={styles.body}>
        <div className={styles.main}>
          <div className={styles.tabs} role="tablist" aria-label="Workspace files">
            {files.map((file) => (
              <button key={file} role="tab" aria-selected={file === activeFile} className={file === activeFile ? styles.tabActive : styles.tab} onClick={() => setActiveFile(file)}>{file}</button>
            ))}
            <form className={styles.newFile} onSubmit={(event) => { event.preventDefault(); addFile(); }}>
              <input aria-label="New file name" value={newFile} onChange={(event) => setNewFile(event.target.value)} placeholder="new-file" autoComplete="off" />
              <button type="submit" className="btn btn-secondary">Add</button>
            </form>
          </div>
          <textarea className={styles.editor} aria-label={'Edit ' + activeFile} spellCheck={false} readOnly={readOnly} value={state.files[activeFile] ?? ''} onChange={(event) => edit(event.target.value)} />
          {readOnly && <p className={styles.note}>{activeFile} is written by the simulator. Change it with commands, not by hand.</p>}
          <div className={styles.terminalTitle}>Terminal</div>
          <div className={styles.transcript} ref={transcriptRef} role="log" aria-label={engine.label + ' terminal output'} aria-live="polite">
            {!entries.length && <p className={styles.dim}>{engine.intro}</p>}
            {entries.map((entry, index) => (
              <div key={index}>
                <div className={styles.cmd}>$ {entry.cmd}</div>
                {entry.out && <pre className={styles.out}>{entry.out}</pre>}
                {entry.err && <pre className={styles.err}>{entry.err}</pre>}
              </div>
            ))}
          </div>
          <form className={styles.commandRow} onSubmit={(event) => { event.preventDefault(); execute(); }}>
            <label htmlFor={'sim-command-' + kind}>$</label>
            <input id={'sim-command-' + kind} aria-label={engine.label + ' command'} value={command} onChange={(event) => setCommand(event.target.value)} onKeyDown={terminal.onKeyDown} placeholder={engine.placeholder} autoComplete="off" spellCheck={false} />
            <button className="btn btn-secondary" type="submit">Run</button>
          </form>
          <p className={styles.help}>{engine.footnote}</p>
        </div>
        <aside className={styles.side} aria-label={sideTitle}>
          <h3>{sideTitle}</h3>
          {side(state)}
        </aside>
      </div>
      <CheckResultsPanel results={results} status={status} stats={passStats} />
    </section>
  );
}
