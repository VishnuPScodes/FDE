import { useCallback, useEffect, useRef, useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { createDockerState, runDockerCommand, type DockerState } from '../lib/docker-runtime';
import { gradeDockerLevel, type DockerCheckResult } from '../lib/docker-grader';
import { getProgress, saveProgress } from '../lib/progress';
import { loadWorkspaceFiles, saveWorkspaceFiles } from '../lib/virtual-files';
import type { LevelMeta } from '../lib/content-loader';
import styles from './DockerWorkspace.module.css';

interface Props { level: LevelMeta; hintsUsed: number; onPassed: () => void }
const META_KEY = '__fde_docker_state__';

export default function DockerWorkspace({ level, hintsUsed, onPassed }: Props) {
  const { user, session } = useAuth();
  const fileKey = (user?.id ?? 'guest') + ':' + level.id + ':docker';
  const stateRef = useRef<DockerState>(createDockerState());
  const startedAt = useRef(Date.now());
  const timeSpentBase = useRef(0);
  const [ready, setReady] = useState(false);
  const [activeFile, setActiveFile] = useState('Dockerfile');
  const [command, setCommand] = useState('');
  const [transcript, setTranscript] = useState('Docker simulator ready. Type docker --help to see supported commands.\n');
  const [checks, setChecks] = useState<DockerCheckResult[] | null>(null);
  const [status, setStatus] = useState('');
  const [attempts, setAttempts] = useState(0);
  const [, setFileRevision] = useState(0);

  const persist = useCallback(async (snapshot: DockerState) => {
    await saveWorkspaceFiles(fileKey, { ...snapshot.files, [META_KEY]: JSON.stringify(snapshot) });
  }, [fileKey]);

  useEffect(() => {
    let active = true;
    async function hydrate() {
      setReady(false);
      const initial: Record<string, string> = {};
      for (const file of level.starter_files ?? []) initial[file.path] = file.content ?? '';
      const stored = await loadWorkspaceFiles(fileKey, initial);
      if (!active) return;
      const { [META_KEY]: metadata, ...files } = stored;
      const next = createDockerState(files);
      if (metadata) {
        try {
          const saved = JSON.parse(metadata) as DockerState;
          Object.assign(next, saved, { files });
          setTranscript(saved.history.map((line, index) => '$ docker ' + line.replace(/^docker\s+/, '') + '\n' + (index === saved.history.length - 1 ? saved.stdout : '')).join('\n'));
        } catch { /* Keep the checked-in starter files when saved state is invalid. */ }
      }
      stateRef.current = next;
      setFileRevision((version) => version + 1);
      const firstFile = Object.keys(files).find((path) => path.toLowerCase().includes('dockerfile')) ?? Object.keys(files)[0];
      if (firstFile) setActiveFile(firstFile);
      setReady(true);
    }
    void hydrate();
    return () => { active = false; };
  }, [fileKey, level]);

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
    return () => { active = false; };
  }, [level.id, onPassed, session?.access_token]);

  const editFile = (value: string) => {
    const next = { ...stateRef.current, files: { ...stateRef.current.files, [activeFile]: value } };
    stateRef.current = next;
    setFileRevision((version) => version + 1);
    void persist(next);
    setChecks(null);
  };

  const execute = () => {
    const line = command.trim();
    if (!line) return;
    const result = runDockerCommand(stateRef.current, line);
    stateRef.current = result.state;
    const printed = '$ ' + line + '\n' + (result.stdout || result.stderr || (result.exitCode === 0 ? '' : 'command failed')) + (result.stdout || result.stderr ? '' : '\n');
    setTranscript((previous) => (previous + printed).split('\n').slice(-240).join('\n'));
    setCommand('');
    setStatus('Exit code ' + result.exitCode);
    setChecks(null);
    void persist(result.state);
  };

  const submit = async () => {
    const nextAttempts = attempts + 1;
    setAttempts(nextAttempts);
    const results = gradeDockerLevel(level.checks, stateRef.current);
    setChecks(results);
    const passed = results.length > 0 && results.every((check) => check.passed);
    const timeSpent = timeSpentBase.current + Math.floor((Date.now() - startedAt.current) / 1000);
    if (session?.access_token) {
      await saveProgress(session.access_token, { level_id: level.id, status: passed ? 'passed' : 'in_progress', attempts: nextAttempts, hints_used: hintsUsed, time_spent_sec: timeSpent }).catch(() => undefined);
      if (passed) onPassed();
      setStatus(passed ? 'Level passed. Progress saved.' : 'Progress saved on this device.');
    } else setStatus(passed ? 'Checks passed. Sign in to sync progress.' : 'Keep going. Your workspace is saved on this device.');
  };

  if (!ready) return <div className={styles.loading}>Starting Docker simulator…</div>;
  const files = Object.keys(stateRef.current.files);
  const passed = checks?.length ? checks.every((check) => check.passed) : false;
  return (
    <section className={styles.workspace} aria-label="Docker simulator workspace">
      <div className={styles.toolbar}>
        <strong>Docker · simulated local engine and registry</strong>
        <button className="btn btn-primary" onClick={() => void submit()}>Submit</button>
      </div>
      <div className={styles.editorToolbar}>
        <label htmlFor="docker-file">Workspace file</label>
        <select id="docker-file" value={activeFile} onChange={(event) => setActiveFile(event.target.value)}>
          {files.map((file) => <option key={file} value={file}>{file}</option>)}
        </select>
        <span>Files stay in this browser workspace.</span>
      </div>
      <textarea className={styles.editor} aria-label={'Edit ' + activeFile} spellCheck={false} value={stateRef.current.files[activeFile] ?? ''} onChange={(event) => editFile(event.target.value)} />
      <div className={styles.terminalTitle}>Terminal</div>
      <pre className={styles.transcript} aria-label="Docker terminal output" aria-live="polite">{transcript}</pre>
      <form className={styles.commandRow} onSubmit={(event) => { event.preventDefault(); execute(); }}>
        <label htmlFor="docker-command">$</label>
        <input id="docker-command" aria-label="Docker command" value={command} onChange={(event) => setCommand(event.target.value)} placeholder="docker build -t app:local ." autoComplete="off" />
        <button className="btn btn-secondary" type="submit">Run</button>
      </form>
      <p className={styles.help}>Commands operate on simulated images, containers, networks, volumes, and a private training registry. They never run on your computer.</p>
      {(checks || status) && <div className={styles.results} aria-live="polite">
        {checks && <><h3 className={passed ? styles.passed : styles.failed}>{passed ? 'All checks passed' : 'Some checks need work'}</h3>
          {checks.map((check, index) => <p key={check.kind + index}>{check.passed ? '✓' : '×'} {check.label}{!check.passed && <><br /><code>Expected: {check.expected || '(no specific value)'}</code><br /><code>Got: {check.actual || '(empty)'}</code></>}</p>)}</>}
        {status && <p>{status}</p>}
      </div>}
    </section>
  );
}
