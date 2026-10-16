import { useCallback, useEffect, useRef, useState } from 'react';
import { FitAddon } from '@xterm/addon-fit';
import { Terminal } from '@xterm/xterm';
import * as monaco from '../../node_modules/monaco-editor/esm/vs/editor/editor.api.js';
import '../../node_modules/monaco-editor/esm/vs/languages/definitions/sql/register.js';
import EditorWorker from '../../node_modules/monaco-editor/esm/vs/editor/editor.worker.js?worker';
import type { editor as MonacoEditor } from 'monaco-editor';
import '@xterm/xterm/css/xterm.css';
import { useAuth } from '../contexts/AuthContext';
import { loadSolutionFiles, loadStarterFile } from '../lib/content-loader';
import { gradeSqlLevel, type SqlCheckResult } from '../lib/sql-grader';
import { createSqlRuntime, type SqlQueryResult, type SqlRuntime, type SqlTable } from '../lib/sql-runtime';
import { getProgress, saveProgress } from '../lib/progress';
import { loadWorkspaceFiles, saveWorkspaceFiles } from '../lib/virtual-files';
import type { LevelMeta } from '../lib/content-loader';
import styles from './SqlWorkspace.module.css';

interface SqlWorkspaceProps { level: LevelMeta; hintsUsed: number; onPassed: () => void }
type MonacoGlobal = typeof globalThis & { MonacoEnvironment?: { getWorker: () => Worker } };

(self as MonacoGlobal).MonacoEnvironment = { getWorker: () => new EditorWorker() };

export default function SqlWorkspace({ level, hintsUsed, onPassed }: SqlWorkspaceProps) {
  const { user, session } = useAuth();
  const editorHost = useRef<HTMLDivElement>(null);
  const outputHost = useRef<HTMLDivElement>(null);
  const editorRef = useRef<MonacoEditor.IStandaloneCodeEditor | null>(null);
  const terminalRef = useRef<Terminal | null>(null);
  const runtimeRef = useRef<SqlRuntime | null>(null);
  const startedAt = useRef(Date.now());
  const timeSpentBase = useRef(0);
  const fileKey = `${user?.id ?? 'guest'}:${level.id}:sql`;
  const [query, setQuery] = useState('');
  const [setupSql, setSetupSql] = useState('');
  const [ready, setReady] = useState(false);
  const [databaseReady, setDatabaseReady] = useState(false);
  const [status, setStatus] = useState('Preparing your SQL workspace…');
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<SqlQueryResult | null>(null);
  const [tables, setTables] = useState<SqlTable[]>([]);
  const [checks, setChecks] = useState<SqlCheckResult[] | null>(null);
  const [attempts, setAttempts] = useState(0);
  const [progressMessage, setProgressMessage] = useState('');
  const [solution, setSolution] = useState<string | null>(null);
  const [selectedTable, setSelectedTable] = useState<string | null>(null);

  const writeOutput = useCallback((text: string) => {
    terminalRef.current?.write(text.replace(/\n/g, '\r\n'));
  }, []);

  useEffect(() => {
    let active = true;
    async function hydrate(): Promise<void> {
      setReady(false);
      setDatabaseReady(false);
      setChecks(null);
      setResult(null);
      setSolution(null);
      setProgressMessage('');
      startedAt.current = Date.now();
      const starter: Record<string, string> = {};
      for (const file of level.starter_files ?? []) {
        starter[file.path] = file.content ?? await loadStarterFile(level.id, file.path, file.from);
      }
      const loaded = await loadWorkspaceFiles(fileKey, starter);
      if (!active) return;
      const initialQuery = loaded['main.sql'] ?? '-- Write a SQL query here\n';
      const initialSetup = starter['setup.sql'] ?? '';
      setQuery(initialQuery);
      setSetupSql(initialSetup);
      setReady(true);
    }
    void hydrate();
    return () => { active = false; };
  }, [fileKey, level]);

  useEffect(() => {
    if (!ready || !editorHost.current) return;
    const editor = monaco.editor.create(editorHost.current, {
      value: query,
      language: 'sql',
      theme: 'vs-dark',
      automaticLayout: true,
      minimap: { enabled: false },
      fontSize: 14,
      tabSize: 2,
      scrollBeyondLastLine: false,
      ariaLabel: 'SQL query editor',
    });
    editorRef.current = editor;
    const subscription = editor.onDidChangeModelContent(() => setQuery(editor.getValue()));
    return () => { subscription.dispose(); editor.dispose(); editorRef.current = null; };
  }, [ready]);

  useEffect(() => {
    if (!ready || !outputHost.current) return;
    const terminal = new Terminal({
      convertEol: true,
      disableStdin: true,
      fontFamily: 'var(--font-mono)',
      fontSize: 12,
      theme: { background: '#090a12', foreground: '#d7d9e0', cursor: '#7c8cff' },
    });
    const fit = new FitAddon();
    terminal.loadAddon(fit);
    terminal.open(outputHost.current);
    fit.fit();
    terminal.write('Query messages will appear here.\r\n');
    terminalRef.current = terminal;
    const resize = new ResizeObserver(() => fit.fit());
    resize.observe(outputHost.current);
    return () => { resize.disconnect(); terminal.dispose(); terminalRef.current = null; };
  }, [ready]);

  const startDatabase = useCallback(async () => {
    runtimeRef.current?.terminate();
    setDatabaseReady(false);
    setStatus('Starting PostgreSQL in your browser…');
    const runtime = createSqlRuntime(setStatus);
    runtimeRef.current = runtime;
    try {
      await runtime.initialize(setupSql);
      const schema = await runtime.inspect();
      setTables(schema);
      setSelectedTable((current) => current && schema.some((table) => table.name === current) ? current : schema[0]?.name ?? null);
      setDatabaseReady(true);
      setStatus('PostgreSQL is ready.');
    } catch (error) {
      setStatus((error as Error).message);
    }
  }, [setupSql]);

  useEffect(() => {
    if (!ready) return;
    void startDatabase();
    return () => { runtimeRef.current?.terminate(); runtimeRef.current = null; };
  }, [ready, startDatabase]);

  useEffect(() => {
    if (!ready) return;
    const timeout = window.setTimeout(() => { void saveWorkspaceFiles(fileKey, { 'main.sql': query }); }, 500);
    return () => window.clearTimeout(timeout);
  }, [fileKey, query, ready]);

  useEffect(() => {
    if (!session?.access_token) return;
    let active = true;
    void getProgress(session.access_token).then((rows) => {
      if (!active) return;
      const row = rows.find((item) => item.level_id === level.id);
      setAttempts(row?.attempts ?? 0);
      timeSpentBase.current = row?.time_spent_sec ?? 0;
      if (row?.status === 'passed') onPassed();
    }).catch(() => undefined);
    void saveProgress(session.access_token, {
      level_id: level.id, status: 'in_progress', attempts: 0, hints_used: 0, time_spent_sec: 0,
    }).catch(() => undefined);
    return () => { active = false; };
  }, [level.id, onPassed, session?.access_token]);

  useEffect(() => {
    if (!session?.access_token) return;
    void saveProgress(session.access_token, {
      level_id: level.id,
      status: 'in_progress',
      attempts,
      hints_used: hintsUsed,
      time_spent_sec: timeSpentBase.current + Math.floor((Date.now() - startedAt.current) / 1000),
    }).catch(() => undefined);
  }, [attempts, hintsUsed, level.id, session?.access_token]);

  const execute = useCallback(async (sql: string): Promise<SqlQueryResult> => {
    if (!runtimeRef.current || !databaseReady) throw new Error('The SQL database is starting. Try again in a moment.');
    setRunning(true);
    setStatus('Running query…');
    terminalRef.current?.clear();
    writeOutput('fde=# query submitted\n');
    try {
      const response = await runtimeRef.current.run(sql);
      setResult(response);
      const schema = await runtimeRef.current.inspect();
      setTables(schema);
      setStatus(`${response.rowCount} row${response.rowCount === 1 ? '' : 's'} returned.`);
      if (response.rows.length === 0) writeOutput(`Query complete. ${response.rowCount} row${response.rowCount === 1 ? '' : 's'} affected.\n`);
      return response;
    } catch (error) {
      const message = (error as Error).message;
      writeOutput(`ERROR: ${message}\n`);
      setStatus('Query failed.');
      throw error;
    } finally {
      setRunning(false);
    }
  }, [databaseReady, writeOutput]);

  const runQuery = useCallback(async () => {
    setChecks(null);
    try { await execute(query); }
    catch { /* The editor status and terminal show the database error. */ }
  }, [execute, query]);

  const submit = useCallback(async () => {
    const nextAttempts = attempts + 1;
    setAttempts(nextAttempts);
    setChecks(null);
    try {
      const evaluated = await gradeSqlLevel(level.checks, query, execute);
      setChecks(evaluated);
      const output = await runtimeRef.current?.run(query);
      if (output) setResult(output);
      const passed = evaluated.length > 0 && evaluated.every((check) => check.passed);
      if (session?.access_token) {
        await saveProgress(session.access_token, {
          level_id: level.id,
          status: passed ? 'passed' : 'in_progress',
          attempts: nextAttempts,
          hints_used: hintsUsed,
          time_spent_sec: timeSpentBase.current + Math.floor((Date.now() - startedAt.current) / 1000),
        });
        if (passed) onPassed();
        setProgressMessage(passed ? 'Level passed. Your progress is saved.' : 'Keep going. Your work is saved on this device.');
      } else {
        setProgressMessage(passed ? 'Checks passed. Sign in to save progress across devices.' : 'Keep going. Your work is saved on this device.');
      }
    } catch (error) {
      setProgressMessage((error as Error).message);
    }
  }, [attempts, execute, hintsUsed, level, onPassed, query, session?.access_token]);

  const revealSolution = useCallback(async () => {
    try {
      const files = await loadSolutionFiles(level.id, ['main.sql']);
      setSolution(files['main.sql'] ?? '');
    } catch (error) { setProgressMessage((error as Error).message); }
  }, [level.id]);

  if (!ready) return <div className={styles.loading}>Loading your SQL workspace…</div>;
  const passed = checks?.length ? checks.every((check) => check.passed) : false;
  const activeTable = tables.find((table) => table.name === selectedTable);

  return (
    <section className={styles.workspace} aria-label="SQL workspace">
      <div className={styles.toolbar}>
        <div className={styles.title}><span className={styles.prompt}>SQL</span><span>{status}</span></div>
        <div className={styles.actions}>
          <button className="btn btn-secondary" disabled={running || !databaseReady} onClick={() => void runQuery()}>Run query</button>
          <button className="btn btn-primary" disabled={running || !databaseReady} onClick={() => void submit()}>{running ? 'Running…' : 'Submit'}</button>
          <button className="btn btn-ghost" disabled={running} onClick={() => void startDatabase()}>Reset database</button>
        </div>
      </div>
      <div ref={editorHost} className={styles.editor} aria-label="SQL query editor" />
      <div className={styles.lowerPane}>
        <aside className={styles.schema} aria-label="Database schema">
          <div className={styles.panelTitle}>Schema</div>
          {tables.length === 0 ? <p className={styles.empty}>No tables yet.</p> : tables.map((table) => (
            <div key={table.name}>
              <button className={table.name === selectedTable ? styles.selectedTable : styles.tableButton} onClick={() => setSelectedTable(table.name)}>{table.name}</button>
              {table.name === selectedTable && <ul className={styles.columns}>{table.columns.map((column) => <li key={column.name}><code>{column.name}</code><span>{column.dataType}{column.nullable ? '' : ' · required'}</span></li>)}</ul>}
            </div>
          ))}
        </aside>
        <div className={styles.outputArea}>
          <div className={styles.panelTitle}>Results</div>
          {result && result.columns.length > 0 ? (
            <div className={styles.tableWrap}>
              <table><thead><tr>{result.columns.map((column) => <th key={column}>{column}</th>)}</tr></thead>
                <tbody>{result.rows.map((row, index) => <tr key={index}>{result.columns.map((column) => <td key={column}>{displayValue(row[column])}</td>)}</tr>)}</tbody>
              </table>
              {result.rows.length === 0 && <p className={styles.empty}>No rows returned.</p>}
            </div>
          ) : <p className={styles.empty}>Run a query to see its results.</p>}
          <div className={styles.messages} ref={outputHost} aria-label="SQL messages" />
        </div>
      </div>
      {activeTable && <span className={styles.srOnly}>Selected table {activeTable.name}</span>}
      {checks && <div className={`${styles.checks} ${passed ? styles.passed : styles.failed}`} aria-live="polite">
        <h3>{passed ? 'All checks passed' : 'Some checks need work'}</h3>
        {checks.map((check, index) => <div key={`${check.kind}-${index}`} className={styles.checkRow}>
          <strong>{check.passed ? '✓' : '×'} {check.label}</strong>
          {!check.passed && <><pre>Expected: {check.expected}</pre><pre>Got: {check.actual || '(no rows)'}</pre></>}
        </div>)}
        {progressMessage && <p>{progressMessage}</p>}
      </div>}
      {!checks && progressMessage && <p className={styles.progressMessage} role="status">{progressMessage}</p>}
      {hintsUsed >= 3 && !passed && <button className="btn btn-ghost" onClick={() => void revealSolution()}>Give up and show the solution</button>}
      {solution !== null && <div className={styles.solution}><h3>Reference solution</h3><pre>{solution}</pre></div>}
    </section>
  );
}

function displayValue(value: unknown): string {
  if (value === null || value === undefined) return 'NULL';
  if (typeof value === 'object') return JSON.stringify(value);
  return String(value);
}
