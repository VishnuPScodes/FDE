import { useCallback, useEffect, useRef, useState } from 'react';
import * as monaco from '../../node_modules/monaco-editor/esm/vs/editor/editor.api.js';
import EditorWorker from '../../node_modules/monaco-editor/esm/vs/editor/editor.worker.js?worker';
import type { editor as MonacoEditor } from 'monaco-editor';
import { useAuth } from '../contexts/AuthContext';
import { gradeTypeScriptLevel } from '../lib/typescript-grader';
import { createTypeScriptCompiler, type TypeScriptCompiler } from '../lib/typescript-runtime';
import { saveProgress } from '../lib/progress';
import { loadWorkspaceFiles, saveWorkspaceFiles, type WorkspaceFiles } from '../lib/virtual-files';
import type { LevelMeta } from '../lib/content-loader';
import styles from './TsWorkspace.module.css';

interface TsWorkspaceProps { level: LevelMeta; hintsUsed: number; onPassed: () => void }
type MonacoGlobal = typeof globalThis & { MonacoEnvironment?: { getWorker: () => Worker } };
(self as MonacoGlobal).MonacoEnvironment = { getWorker: () => new EditorWorker() };

interface SandboxResult { id: number; source: string; type: 'result'; stdout: string; stderr: string; passed: number; failed: number; preview: string }
interface PendingRun { resolve: (result: SandboxResult) => void; timeout: number }

const SANDBOX_DOCUMENT = `<!doctype html><html><head><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'unsafe-inline' 'unsafe-eval'; style-src 'unsafe-inline'; img-src data:; connect-src 'none'; form-action 'none'; object-src 'none'; base-uri 'none'"><style>body{font:15px system-ui,sans-serif;color:#202435;margin:16px}#root{min-height:24px}</style></head><body><div id="root"></div><script>
(() => {
  const tests = [];
  let activeRun = 0;
  const printable = (value) => typeof value === 'string' ? value : JSON.stringify(value);
  const send = (data) => parent.postMessage({ source: 'fde-ts-sandbox', id: activeRun, type: 'result', ...data }, '*');
  function h(type, props, ...children) { return { type, props: props || {}, children: children.flat(Infinity) }; }
  function append(value, parentNode) {
    if (value === null || value === undefined || typeof value === 'boolean') return;
    if (Array.isArray(value)) { value.forEach((child) => append(child, parentNode)); return; }
    if (typeof value === 'string' || typeof value === 'number') { parentNode.append(document.createTextNode(String(value))); return; }
    if (typeof value.type === 'function') { append(value.type({ ...value.props, children: value.children }), parentNode); return; }
    if (value.type === React.Fragment) { append(value.children, parentNode); return; }
    if (typeof value.type !== 'string' || /^(script|iframe|object|embed|link|meta|style)$/.test(value.type)) throw new Error('The preview only renders safe text and basic UI elements.');
    const element = document.createElement(value.type);
    for (const [key, prop] of Object.entries(value.props)) {
      if (key === 'className') element.setAttribute('class', String(prop));
      else if (key === 'title' || key === 'role' || key === 'type' || key === 'value' || key.startsWith('aria-') || key.startsWith('data-')) element.setAttribute(key, String(prop));
    }
    append(value.children, element);
    parentNode.append(element);
  }
  const React = { createElement: h, Fragment: Symbol('Fragment') };
  const ReactDOM = { createRoot: (target) => ({ render: (view) => { target.replaceChildren(); append(view, target); } }) };
  const expect = (actual) => ({
    toBe: (expected) => { if (!Object.is(actual, expected)) throw new Error('Expected ' + printable(actual) + ' to be ' + printable(expected)); },
    toEqual: (expected) => { if (JSON.stringify(actual) !== JSON.stringify(expected)) throw new Error('Expected ' + printable(actual) + ' to equal ' + printable(expected)); },
    toContain: (expected) => { if (!actual?.includes?.(expected)) throw new Error('Expected ' + printable(actual) + ' to contain ' + printable(expected)); },
    toBeTruthy: () => { if (!actual) throw new Error('Expected a truthy value, got ' + printable(actual)); },
  });
  window.addEventListener('message', async (event) => {
    if (event.source !== parent || event.data?.type !== 'run') return;
    activeRun = event.data.id;
    const logs = [];
    const console = { log: (...values) => logs.push(values.map(printable).join(' ')), info: (...values) => logs.push(values.map(printable).join(' ')) };
    const test = (name, fn) => tests.push({ name, fn });
    try {
      const execute = new Function('console', 'test', 'expect', 'React', 'ReactDOM', 'document', event.data.code);
      await execute(console, test, expect, React, ReactDOM, document);
      let passed = 0;
      let failed = 0;
      for (const item of tests.splice(0)) {
        try { await item.fn(); logs.push('✓ ' + item.name); passed += 1; }
        catch (error) { logs.push('× ' + item.name + ': ' + (error?.message || String(error))); failed += 1; }
      }
      send({ stdout: logs.join('\\n'), stderr: '', passed, failed, preview: document.getElementById('root')?.innerText || '' });
    } catch (error) {
      send({ stdout: logs.join('\\n'), stderr: error?.stack || String(error), passed: 0, failed: 1, preview: '' });
    }
  });
})();
<\/script></body></html>`;

export default function TsWorkspace({ level, hintsUsed, onPassed }: TsWorkspaceProps) {
  const { user, session } = useAuth();
  const editorHost = useRef<HTMLDivElement>(null);
  const editorRef = useRef<MonacoEditor.IStandaloneCodeEditor | null>(null);
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const compilerRef = useRef<TypeScriptCompiler | null>(null);
  const pendingRef = useRef<PendingRun | null>(null);
  const requestId = useRef(0);
  const fileKey = `${user?.id ?? 'guest'}:${level.id}`;
  const [files, setFiles] = useState<WorkspaceFiles>({});
  const [activeFile, setActiveFile] = useState('main.ts');
  const [ready, setReady] = useState(false);
  const [busy, setBusy] = useState(false);
  const [runtimeStatus, setRuntimeStatus] = useState('TypeScript compiles when you run the workspace.');
  const [result, setResult] = useState<SandboxResult | null>(null);
  const [message, setMessage] = useState('');
  const [attempts, setAttempts] = useState(0);
  const filesRef = useRef(files);
  filesRef.current = files;

  useEffect(() => {
    let active = true;
    async function hydrate(): Promise<void> {
      setReady(false); setResult(null); setMessage('');
      const starter: WorkspaceFiles = {};
      for (const file of level.starter_files ?? []) starter[file.path] = file.content ?? '';
      if (!Object.keys(starter).length) starter['main.ts'] = '// Write TypeScript here.\n';
      const saved = await loadWorkspaceFiles(fileKey, starter);
      if (!active) return;
      setFiles(saved); setActiveFile(Object.keys(saved)[0] ?? 'main.ts'); setReady(true);
    }
    void hydrate();
    return () => { active = false; };
  }, [fileKey, level]);

  useEffect(() => {
    if (!ready || !editorHost.current) return;
    const editor = monaco.editor.create(editorHost.current, {
      value: filesRef.current[activeFile] ?? '', language: activeFile.endsWith('x') ? 'typescript' : activeFile.endsWith('.js') ? 'javascript' : 'typescript',
      theme: 'vs-dark', automaticLayout: true, minimap: { enabled: false }, fontSize: 14, tabSize: 2,
      scrollBeyondLastLine: false, ariaLabel: `Code editor: ${activeFile}`,
    });
    editorRef.current = editor;
    const subscription = editor.onDidChangeModelContent(() => setFiles((previous) => ({ ...previous, [activeFile]: editor.getValue() })));
    return () => { subscription.dispose(); editor.dispose(); editorRef.current = null; };
  }, [activeFile, ready]);

  useEffect(() => {
    if (!ready) return;
    const timeout = window.setTimeout(() => { void saveWorkspaceFiles(fileKey, files); }, 400);
    return () => window.clearTimeout(timeout);
  }, [fileKey, files, ready]);

  useEffect(() => {
    compilerRef.current = createTypeScriptCompiler();
    return () => { compilerRef.current?.terminate(); compilerRef.current = null; };
  }, []);

  useEffect(() => {
    const handleMessage = (event: MessageEvent<SandboxResult>) => {
      if (event.source !== iframeRef.current?.contentWindow || event.data.source !== 'fde-ts-sandbox') return;
      if (pendingRef.current?.timeout) window.clearTimeout(pendingRef.current.timeout);
      pendingRef.current?.resolve(event.data);
      pendingRef.current = null;
    };
    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, []);

  const execute = useCallback(async (): Promise<SandboxResult> => {
    const source = files[activeFile] ?? '';
    const loader = activeFile.endsWith('.tsx') ? 'tsx' : activeFile.endsWith('.jsx') ? 'jsx' : activeFile.endsWith('.js') ? 'js' : 'ts';
    setBusy(true); setResult(null); setMessage(''); setRuntimeStatus('Compiling with esbuild-wasm…');
    try {
      const compiled = await compilerRef.current?.compile(source, loader);
      if (!compiled?.ok) {
        const failure = { id: 0, source, type: 'result' as const, stdout: '', stderr: compiled?.error ?? 'Compiler is starting.', passed: 0, failed: 1, preview: '' };
        setResult(failure); setRuntimeStatus('Compilation failed.');
        return failure;
      }
      const frame = iframeRef.current;
      if (!frame?.contentWindow) throw new Error('The isolated preview is not ready yet.');
      const id = ++requestId.current;
      const sandboxResult = await new Promise<SandboxResult>((resolve) => {
        const timeout = window.setTimeout(() => {
          pendingRef.current = null;
          if (frame) frame.srcdoc = SANDBOX_DOCUMENT;
          resolve({ id, source, type: 'result', stdout: '', stderr: 'The program took too long and was stopped.', passed: 0, failed: 1, preview: '' });
        }, 5000);
        pendingRef.current = { resolve, timeout };
        frame.contentWindow!.postMessage({ type: 'run', id, code: compiled.code }, '*');
      });
      const finalResult = { ...sandboxResult, source };
      setResult(finalResult); setRuntimeStatus('TypeScript is ready.');
      return finalResult;
    } catch (error) {
      const failed = { id: 0, source, type: 'result' as const, stdout: '', stderr: (error as Error).message, passed: 0, failed: 1, preview: '' };
      setResult(failed); setRuntimeStatus('Compile or run failed.');
      return failed;
    } finally { setBusy(false); }
  }, [activeFile, files]);

  const submit = useCallback(async () => {
    const output = await execute();
    const checks = gradeTypeScriptLevel(level.checks, files, output);
    const passed = checks.length > 0 && checks.every((check) => check.passed);
    const nextAttempts = attempts + 1; setAttempts(nextAttempts);
    let synced = true;
    if (session?.access_token) {
      try { await saveProgress(session.access_token, { level_id: level.id, status: passed ? 'passed' : 'in_progress', attempts: nextAttempts, hints_used: hintsUsed, time_spent_sec: 0 }); }
      catch { synced = false; }
    }
    if (passed) onPassed();
    setMessage(passed ? session?.access_token ? synced ? 'Level passed. Your progress is saved.' : 'Checks passed, but progress could not sync.' : 'Checks passed. Sign in to sync progress across devices.' : 'Some checks need work. Read each result, update your code, and submit again.');
  }, [attempts, execute, files, hintsUsed, level.checks, level.id, onPassed, session?.access_token]);

  if (!ready) return <div className={styles.loading}>Loading your code workspace…</div>;
  const checkResults = result ? gradeTypeScriptLevel(level.checks, files, result) : [];
  const passed = checkResults.length > 0 && checkResults.every((check) => check.passed);
  return (
    <section className={styles.workspace} aria-label="TypeScript workspace">
      <header className={styles.toolbar}><div><strong>{level.environment === 'js' ? 'JavaScript' : 'TypeScript'} workspace</strong><span>{runtimeStatus}</span></div><div className={styles.actions}><button className="btn btn-secondary" disabled={busy} onClick={() => void execute()}>Run</button><button className="btn btn-primary" disabled={busy} onClick={() => void submit()}>{busy ? 'Running…' : 'Submit'}</button></div></header>
      <div className={styles.files}>{Object.keys(files).map((name) => <button key={name} aria-pressed={name === activeFile} onClick={() => setActiveFile(name)}>{name}</button>)}</div>
      <div ref={editorHost} className={styles.editor} aria-label="TypeScript code editor" />
      <div className={styles.previewHeader}><strong>Isolated output and preview</strong><span>Runs in a sandboxed iframe with network access disabled.</span></div>
      <iframe ref={iframeRef} className={styles.preview} title="Sandboxed code output and React preview" sandbox="allow-scripts" srcDoc={SANDBOX_DOCUMENT} />
      {result && <div className={`${styles.output} ${passed ? styles.passed : styles.failed}`} aria-live="polite"><h3>{passed ? 'All checks passed' : 'Run output'}</h3>{result.stdout && <pre>{result.stdout}</pre>}{result.stderr && <pre>{result.stderr}</pre>}{result.preview && <p>Preview text: {result.preview}</p>}{checkResults.map((check, index) => <p key={`${check.label}-${index}`}>{check.passed ? '✓' : '×'} {check.label}{!check.passed && <> · expected <code>{check.expected}</code>, got <code>{check.actual}</code></>}</p>)}</div>}
      {message && <p className={styles.message} role="status">{message}</p>}
    </section>
  );
}
