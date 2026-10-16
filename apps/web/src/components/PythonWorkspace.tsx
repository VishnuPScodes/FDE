import { useCallback, useEffect, useRef, useState } from 'react';
import { Terminal } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import * as monaco from '../../node_modules/monaco-editor/esm/vs/editor/editor.api.js';
import '../../node_modules/monaco-editor/esm/vs/languages/definitions/python/register.js';
import EditorWorker from '../../node_modules/monaco-editor/esm/vs/editor/editor.worker.js?worker';
import type { editor as MonacoEditor } from 'monaco-editor';
import '@xterm/xterm/css/xterm.css';
import { useAuth } from '../contexts/AuthContext';
import { loadSolutionFiles, loadStarterFile } from '../lib/content-loader';
import { gradePythonLevel, type CheckResult } from '../lib/grader';
import { createPythonRuntime, type PythonRuntime } from '../lib/python-runtime';
import { getProgress, saveProgress } from '../lib/progress';
import { loadWorkspaceFiles, saveWorkspaceFiles, type WorkspaceFiles } from '../lib/virtual-files';
import type { LevelMeta } from '../lib/content-loader';
import styles from './PythonWorkspace.module.css';

interface PythonWorkspaceProps { level: LevelMeta; hintsUsed: number; onPassed: () => void }
type MonacoGlobal = typeof globalThis & { MonacoEnvironment?: { getWorker: () => Worker } };

(self as MonacoGlobal).MonacoEnvironment = { getWorker: () => new EditorWorker() };

export default function PythonWorkspace({ level, hintsUsed, onPassed }: PythonWorkspaceProps) {
  const { user, session } = useAuth();
  const editorHost = useRef<HTMLDivElement>(null);
  const terminalHost = useRef<HTMLDivElement>(null);
  const editorRef = useRef<MonacoEditor.IStandaloneCodeEditor | null>(null);
  const terminalRef = useRef<Terminal | null>(null);
  const runtimeRef = useRef<PythonRuntime | null>(null);
  const startedAt = useRef(Date.now());
  const timeSpentBase = useRef(0);
  const [files, setFiles] = useState<WorkspaceFiles>({});
  const [activeFile, setActiveFile] = useState('main.py');
  const [ready, setReady] = useState(false);
  const [running, setRunning] = useState(false);
  const [runtimeStatus, setRuntimeStatus] = useState('Python runtime loads when you first run code.');
  const [checks, setChecks] = useState<CheckResult[] | null>(null);
  const [attempts, setAttempts] = useState(0);
  const [progressMessage, setProgressMessage] = useState('');
  const [solution, setSolution] = useState<string | null>(null);
  const fileKey = `${user?.id ?? 'guest'}:${level.id}`;
  const filesRef = useRef(files);
  filesRef.current = files;

  const writeTerminal = useCallback((text: string) => {
    terminalRef.current?.write(text.replace(/\n/g, '\r\n'));
  }, []);

  useEffect(() => {
    if (!ready) return;
    if (!terminalHost.current) return;
    const terminal = new Terminal({ convertEol: true, disableStdin: true, fontFamily: 'var(--font-mono)', fontSize: 13, theme: { background: '#090a12', foreground: '#d7d9e0', cursor: '#7c8cff' } });
    const fit = new FitAddon();
    terminal.loadAddon(fit);
    terminal.open(terminalHost.current);
    fit.fit();
    terminal.write('Python output will appear here.\r\n');
    terminalRef.current = terminal;
    const resize = new ResizeObserver(() => fit.fit());
    resize.observe(terminalHost.current);
    return () => { resize.disconnect(); terminal.dispose(); terminalRef.current = null; };
  }, [ready]);

  useEffect(() => {
    let active = true;
    async function hydrateFiles(): Promise<void> {
      setReady(false);
      setChecks(null);
      setSolution(null);
      setProgressMessage('');
      startedAt.current = Date.now();
      const starter: WorkspaceFiles = {};
      for (const file of level.starter_files ?? []) {
        starter[file.path] = file.content ?? await loadStarterFile(level.id, file.path, file.from);
      }
      if (!Object.keys(starter).length) starter['main.py'] = '# Write your Python code here\n';
      const saved = await loadWorkspaceFiles(fileKey, starter);
      if (!active) return;
      setFiles(saved);
      setActiveFile(Object.keys(saved)[0] ?? 'main.py');
      setReady(true);
    }
    void hydrateFiles();
    return () => { active = false; };
  }, [fileKey, level]);

  useEffect(() => {
    if (!ready || !editorHost.current) return;
    let editor: MonacoEditor.IStandaloneCodeEditor | undefined;
    async function createEditor(): Promise<void> {
      if (!editorHost.current) return;
      editor = monaco.editor.create(editorHost.current, {
        value: files[activeFile] ?? '', language: 'python', theme: 'vs-dark', automaticLayout: true,
        minimap: { enabled: false }, fontSize: 14, tabSize: 4, scrollBeyondLastLine: false,
        ariaLabel: `Python editor: ${activeFile}`,
      });
      editorRef.current = editor;
      editor.onDidChangeModelContent(() => {
        const value = editor?.getValue() ?? '';
        setFiles((previous) => ({ ...previous, [activeFile]: value }));
      });
    }
    void createEditor();
    return () => { editor?.dispose(); editorRef.current = null; };
  }, [ready, activeFile]);

  useEffect(() => {
    if (!ready) return;
    const timeout = window.setTimeout(() => { void saveWorkspaceFiles(fileKey, files); }, 500);
    return () => window.clearTimeout(timeout);
  }, [ready, fileKey, files]);

  useEffect(() => () => { if (ready) void saveWorkspaceFiles(fileKey, filesRef.current); }, [fileKey]);

  useEffect(() => {
    runtimeRef.current = createPythonRuntime(
      (stream, text) => { if (stream === 'stdout') writeTerminal(text); else { terminalRef.current?.write(`\x1b[31m${text.replace(/\n/g, '\r\n')}\x1b[0m`); } },
      setRuntimeStatus,
    );
    return () => { runtimeRef.current?.terminate(); runtimeRef.current = null; };
  }, [writeTerminal]);

  useEffect(() => {
    if (!session?.access_token) return;
    let active = true;
    void getProgress(session.access_token).then((rows) => {
      if (active) {
        const row = rows.find((item) => item.level_id === level.id);
        setAttempts(row?.attempts ?? 0);
        timeSpentBase.current = row?.time_spent_sec ?? 0;
        if (row?.status === 'passed') onPassed();
      }
    }).catch(() => undefined);
    void saveProgress(session.access_token, { level_id: level.id, status: 'in_progress', attempts: 0, hints_used: 0, time_spent_sec: 0 }).catch(() => undefined);
    return () => { active = false; };
  }, [level.id, onPassed, session?.access_token]);

  useEffect(() => {
    if (!session?.access_token) return;
    void saveProgress(session.access_token, {
      level_id: level.id, status: 'in_progress', attempts, hints_used: hintsUsed,
      time_spent_sec: timeSpentBase.current + Math.floor((Date.now() - startedAt.current) / 1000),
    }).catch(() => undefined);
  }, [hintsUsed, level.id, session?.access_token]);

  const execute = useCallback(async (command: string) => {
    if (!runtimeRef.current) throw new Error('Python runtime is starting. Try again in a moment.');
    setRunning(true);
    setRuntimeStatus('Running your code…');
    terminalRef.current?.clear();
    writeTerminal(`$ ${command}\n`);
    try {
      return await runtimeRef.current.run(files, command);
    } finally {
      setRunning(false);
      setRuntimeStatus('Python is ready.');
    }
  }, [files, writeTerminal]);

  const runCode = useCallback(async () => {
    const command = 'python main.py';
    try {
      const result = await execute(command);
      if (result.exitCode === 0 && !result.stdout && !result.stderr) writeTerminal('Program finished without output.\n');
      else if (result.exitCode !== 0) writeTerminal(`Process exited with code ${String(result.exitCode)}.\n`);
    } catch (error) {
      writeTerminal(`${(error as Error).message}\n`);
    }
  }, [execute, level.checks, writeTerminal]);

  const submit = useCallback(async () => {
    const nextAttempts = attempts + 1;
    setAttempts(nextAttempts);
    setChecks(null);
    try {
      const results = await gradePythonLevel(level, files, execute);
      setChecks(results);
      const passed = results.length > 0 && results.every((result) => result.passed);
      if (session?.access_token) {
        let progressSynced = true;
        try {
          await saveProgress(session.access_token, {
            level_id: level.id, status: passed ? 'passed' : 'in_progress', attempts: nextAttempts,
            hints_used: hintsUsed, time_spent_sec: timeSpentBase.current + Math.floor((Date.now() - startedAt.current) / 1000),
          });
        } catch {
          progressSynced = false;
        }
        if (passed) onPassed();
        setProgressMessage(passed
          ? progressSynced ? 'Level passed. Your progress is saved.' : 'Checks passed, but progress could not sync. Your code is saved on this device.'
          : progressSynced ? 'Keep going. Your work is saved on this device.' : 'Your code is saved on this device, but progress could not sync.');
      } else {
        setProgressMessage(passed ? 'Checks passed. Sign in to save progress across devices.' : 'Keep going. Your work is saved on this device.');
      }
    } catch (error) {
      setProgressMessage((error as Error).message);
    }
  }, [attempts, execute, files, hintsUsed, level, onPassed, session?.access_token]);

  const revealSolution = useCallback(async () => {
    try {
      const sources = await loadSolutionFiles(level.id, Object.keys(files));
      setSolution(Object.entries(sources).map(([path, source]) => `# ${path}\n${source}`).join('\n'));
    } catch (error) { setProgressMessage((error as Error).message); }
  }, [files, level.id]);

  if (!ready) return <div className={styles.loading}>Loading your workspace…</div>;
  const passed = checks?.length ? checks.every((check) => check.passed) : false;
  return (
    <section className={styles.workspace} aria-label="Python workspace">
      <div className={styles.toolbar}>
        <div className={styles.fileTabs} role="tablist" aria-label="Workspace files">
          {Object.keys(files).map((name) => <button key={name} role="tab" aria-selected={name === activeFile} className={name === activeFile ? styles.activeTab : styles.tab} onClick={() => setActiveFile(name)}>{name}</button>)}
        </div>
        <div className={styles.actions}>
          <button className="btn btn-secondary" disabled={running} onClick={() => void runCode()}>Run</button>
          <button className="btn btn-primary" disabled={running} onClick={() => void submit()}>{running ? 'Running…' : 'Submit'}</button>
        </div>
      </div>
      <div ref={editorHost} className={styles.editor} aria-label="Code editor" />
      <div className={styles.terminalHeader}><strong>Terminal</strong><span>{runtimeStatus.includes('Downloading') ? <><progress aria-label="Downloading Python runtime" /> {runtimeStatus}</> : runtimeStatus}</span></div>
      <div ref={terminalHost} className={styles.terminal} aria-label="Program output" />
      {checks && <div className={`${styles.results} ${passed ? styles.passed : styles.failed}`} aria-live="polite">
        <h3>{passed ? 'All checks passed' : 'Some checks need work'}</h3>
        {checks.map((check, index) => <div key={`${check.kind}-${index}`} className={styles.checkRow}>
          <strong>{check.passed ? '✓' : '×'} {check.label}</strong>
          {!check.passed && <><pre>Expected: {check.expected}</pre><pre>Got: {check.actual || '(no output)'}</pre>{check.feedback && <p>{check.feedback}</p>}</>}
        </div>)}
        {progressMessage && <p>{progressMessage}</p>}
      </div>}
      {!checks && progressMessage && <p className={styles.progressMessage} role="status">{progressMessage}</p>}
      {hintsUsed >= 3 && !passed && <button className="btn btn-ghost" onClick={() => void revealSolution()}>Give up and show the solution</button>}
      {solution !== null && <div className={styles.solution}><h3>Reference solution</h3><pre>{solution}</pre></div>}
    </section>
  );
}

