import { lazy, Suspense, useCallback, useEffect, useRef, useState } from 'react';
import { FitAddon } from '@xterm/addon-fit';
import { Terminal } from '@xterm/xterm';
import '@xterm/xterm/css/xterm.css';
import { useAuth } from '../contexts/AuthContext';
import { loadStarterFile } from '../lib/content-loader';
import { gradeShellLevel, type ShellCheckResult } from '../lib/shell-grader';
import { createShellState, runShellCommand, type ShellState } from '../lib/shell-runtime';
import { getProgress, saveProgress } from '../lib/progress';
import { loadWorkspaceFiles, saveWorkspaceFiles } from '../lib/virtual-files';
import type { LevelMeta } from '../lib/content-loader';
import styles from './ShellWorkspace.module.css';

const V86LinuxPanel = lazy(() => import('./V86LinuxPanel'));

interface ShellWorkspaceProps {
  level: LevelMeta;
  hintsUsed: number;
  onPassed: () => void;
}
const META_KEY = '__fde_shell_session__';

export default function ShellWorkspace({ level, hintsUsed, onPassed }: ShellWorkspaceProps) {
  const { user, session } = useAuth();
  const terminalHost = useRef<HTMLDivElement>(null);
  const terminalRef = useRef<Terminal | null>(null);
  const stateRef = useRef<ShellState>(createShellState());
  const lineRef = useRef('');
  const historyOffset = useRef(0);
  const startedAt = useRef(Date.now());
  const timeSpentBase = useRef(0);
  const fileKey = `${user?.id ?? 'guest'}:${level.id}:shell`;
  const [ready, setReady] = useState(false);
  const [checks, setChecks] = useState<ShellCheckResult[] | null>(null);
  const [status, setStatus] = useState('Starting practice shell…');
  const [progressMessage, setProgressMessage] = useState('');
  const [attempts, setAttempts] = useState(0);
  const [vmMode, setVmMode] = useState(false);

  const persist = useCallback(async () => {
    const snapshot = stateRef.current;
    await saveWorkspaceFiles(fileKey, {
      ...snapshot.files,
      [META_KEY]: JSON.stringify({
        cwd: snapshot.cwd,
        directories: snapshot.directories,
        env: snapshot.env,
        history: snapshot.history,
      }),
    });
  }, [fileKey]);

  const execute = useCallback(
    (input: string) => {
      const terminal = terminalRef.current;
      const current = stateRef.current;
      const result = runShellCommand(current, input);
      stateRef.current = result.state;
      if (result.stdout) terminal?.write(result.stdout.replace(/\n/g, '\r\n'));
      if (result.stderr) terminal?.write(`\x1b[31m${result.stderr.replace(/\n/g, '\r\n')}\x1b[0m`);
      terminal?.write(result.prompt);
      void persist();
      setStatus(
        result.exitCode === 0
          ? `Exit code ${result.exitCode}`
          : `Command failed with exit code ${result.exitCode}`,
      );
      setChecks(null);
    },
    [persist],
  );

  useEffect(() => {
    let active = true;
    async function hydrate() {
      setReady(false);
      setChecks(null);
      startedAt.current = Date.now();
      const starter: Record<string, string> = {};
      for (const file of level.starter_files ?? []) {
        const text = file.content ?? (await loadStarterFile(level.id, file.path, file.from));
        starter[`/workspace/${file.path.replace(/^\/+/, '')}`] = text;
      }
      const saved = await loadWorkspaceFiles(fileKey, starter);
      if (!active) return;
      const { [META_KEY]: metaText, ...files } = saved;
      const next = createShellState(files);
      if (metaText) {
        try {
          const meta = JSON.parse(metaText) as Partial<ShellState>;
          if (Array.isArray(meta.directories))
            next.directories = [
              ...new Set([
                ...next.directories,
                ...meta.directories.filter((path): path is string => typeof path === 'string'),
              ]),
            ];
          if (typeof meta.cwd === 'string' && next.directories.includes(meta.cwd))
            next.cwd = meta.cwd;
          if (meta.env && typeof meta.env === 'object') next.env = { ...next.env, ...meta.env };
          if (Array.isArray(meta.history))
            next.history = meta.history.filter((item): item is string => typeof item === 'string');
        } catch {
          /* Ignore corrupt saved terminal metadata and keep the files. */
        }
      }
      stateRef.current = next;
      setReady(true);
      setStatus('Practice shell ready. Type help to see available commands.');
    }
    void hydrate();
    return () => {
      active = false;
    };
  }, [fileKey, level]);

  useEffect(() => {
    if (!ready || !terminalHost.current) return;
    const terminal = new Terminal({
      convertEol: true,
      fontFamily: 'var(--font-mono)',
      fontSize: 13,
      cursorBlink: true,
      theme: { background: '#090a12', foreground: '#d7d9e0', cursor: '#7c8cff' },
    });
    const fit = new FitAddon();
    terminal.loadAddon(fit);
    terminal.open(terminalHost.current);
    fit.fit();
    terminalRef.current = terminal;
    terminal.write('FDE Linux practice shell · simulated environment\r\n');
    terminal.write(`learner@fde:${stateRef.current.cwd} $ `);
    const input = terminal.onData((data) => {
      if (data === '\r') {
        const command = lineRef.current;
        lineRef.current = '';
        historyOffset.current = 0;
        terminal.write('\r\n');
        execute(command);
      } else if (data === '\u001b[A' || data === '\u001b[B') {
        const history = stateRef.current.history;
        if (data === '\u001b[A')
          historyOffset.current = Math.min(historyOffset.current + 1, history.length);
        else historyOffset.current = Math.max(historyOffset.current - 1, 0);
        lineRef.current = historyOffset.current
          ? (history[history.length - historyOffset.current] ?? '')
          : '';
        terminal.write(`\r\x1b[2Klearner@fde:${stateRef.current.cwd} $ ${lineRef.current}`);
      } else if (data === '\t') {
        const fragment = lineRef.current.split(/\s/).at(-1) ?? '';
        const candidates = lineRef.current.includes(' ')
          ? [...Object.keys(stateRef.current.files), ...stateRef.current.directories]
              .map((path) => path.split('/').at(-1) ?? '')
              .filter(Boolean)
          : [
              'pwd',
              'ls',
              'cd',
              'mkdir',
              'touch',
              'cat',
              'echo',
              'printf',
              'cp',
              'mv',
              'rm',
              'grep',
              'head',
              'wc',
              'cut',
              'sort',
              'uniq',
              'sed',
              'awk',
              'jq',
              'env',
              'export',
              'whoami',
              'clear',
              'date',
              'ps',
              'top',
              'lsof',
              'crontab',
              'curl',
              'help',
            ];
        const matches = [...new Set(candidates.filter((item) => item.startsWith(fragment)))];
        if (matches.length === 1) {
          const completion =
            matches[0]!.slice(fragment.length) + (lineRef.current.includes(' ') ? '' : ' ');
          lineRef.current += completion;
          terminal.write(completion);
        } else if (matches.length > 1) {
          terminal.write(
            `\r\n${matches.join('  ')}\r\nlearner@fde:${stateRef.current.cwd} $ ${lineRef.current}`,
          );
        }
      } else if (data === '\u007f') {
        if (lineRef.current.length) {
          lineRef.current = lineRef.current.slice(0, -1);
          terminal.write('\b \b');
        }
      } else if (data === '\u0003') {
        lineRef.current = '';
        terminal.write('^C\r\n');
        terminal.write(`learner@fde:${stateRef.current.cwd} $ `);
      } else if (data >= ' ') {
        lineRef.current += data;
        terminal.write(data);
      }
    });
    const observer = new ResizeObserver(() => fit.fit());
    observer.observe(terminalHost.current);
    return () => {
      observer.disconnect();
      input.dispose();
      terminal.dispose();
      terminalRef.current = null;
    };
  }, [execute, ready]);

  useEffect(() => {
    if (!session?.access_token) return;
    let active = true;
    void getProgress(session.access_token)
      .then((rows) => {
        if (!active) return;
        const row = rows.find((item) => item.level_id === level.id);
        setAttempts(row?.attempts ?? 0);
        timeSpentBase.current = row?.time_spent_sec ?? 0;
        if (row?.status === 'passed') onPassed();
      })
      .catch(() => undefined);
    return () => {
      active = false;
    };
  }, [level.id, onPassed, session?.access_token]);

  const submit = useCallback(async () => {
    const nextAttempts = attempts + 1;
    setAttempts(nextAttempts);
    const results = gradeShellLevel(level.checks, stateRef.current);
    setChecks(results);
    const passed = results.length > 0 && results.every((check) => check.passed);
    const timeSpent = timeSpentBase.current + Math.floor((Date.now() - startedAt.current) / 1000);
    if (session?.access_token) {
      await saveProgress(session.access_token, {
        level_id: level.id,
        status: passed ? 'passed' : 'in_progress',
        attempts: nextAttempts,
        hints_used: hintsUsed,
        time_spent_sec: timeSpent,
      }).catch(() => undefined);
      if (passed) onPassed();
      setProgressMessage(
        passed ? 'Level passed. Your progress is saved.' : 'Your work is saved on this device.',
      );
    } else {
      setProgressMessage(
        passed
          ? 'Checks passed. Sign in to save progress across devices.'
          : 'Keep going. Your work is saved on this device.',
      );
    }
  }, [attempts, hintsUsed, level.checks, level.id, onPassed, session?.access_token]);

  if (!ready) return <div className={styles.loading}>Starting practice shell…</div>;
  const passed = checks?.length ? checks.every((check) => check.passed) : false;
  return (
    <section className={styles.workspace} aria-label="Linux shell workspace">
      <div className={styles.toolbar}>
        <div className={styles.title}>
          <span className={styles.prompt}>bash</span>
          <span>{vmMode ? 'Linux virtual machine' : status}</span>
        </div>
        <div className={styles.actions}>
          <button className={vmMode ? 'btn btn-secondary' : 'btn btn-primary'} onClick={() => setVmMode(false)} aria-pressed={!vmMode}>Practice shell</button>
          <button className={vmMode ? 'btn btn-primary' : 'btn btn-secondary'} onClick={() => setVmMode(true)} aria-pressed={vmMode}>Linux VM</button>
          {!vmMode && <button className="btn btn-primary" onClick={() => void submit()}>Submit</button>}
        </div>
      </div>
      <div className={vmMode ? styles.hidden : styles.modeContent}>
        <div ref={terminalHost} className={styles.terminal} aria-label="Linux terminal" />
        <div className={styles.help}>
          This is a safe, simulated Linux shell. It supports common file, text and environment
          commands; it does not access your computer or the network.
        </div>
      </div>
      {vmMode && <div className={styles.modeContent}>
        <Suspense fallback={<div className={styles.loading}>Loading Linux VM runtime…</div>}>
          <V86LinuxPanel />
        </Suspense>
        <div className={styles.help}>
          This is a separate Buildroot Linux guest. It has no network access and does not share files
          with the practice shell. Use Practice shell to complete and submit this level.
        </div>
      </div>}
      {checks && (
        <div
          className={`${styles.checks} ${passed ? styles.passed : styles.failed}`}
          aria-live="polite"
        >
          <h3>{passed ? 'All checks passed' : 'Some checks need work'}</h3>
          {checks.map((check, index) => (
            <p key={`${check.kind}-${index}`}>
              {check.passed ? '✓' : '×'} {check.label}
              {!check.passed && (
                <>
                  <br />
                  <code>Expected: {check.expected || '(no specific value)'}</code>
                  <br />
                  <code>Got: {check.actual || '(empty)'}</code>
                </>
              )}
            </p>
          ))}
          {progressMessage && <p>{progressMessage}</p>}
        </div>
      )}
      {!checks && progressMessage && (
        <p className={styles.status} role="status">
          {progressMessage}
        </p>
      )}
    </section>
  );
}
