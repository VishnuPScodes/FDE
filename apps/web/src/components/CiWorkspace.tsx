import { useTerminalInput } from '../hooks/useTerminalInput';
import CodeEditor from './CodeEditor';
import { CI_COMMANDS } from '../lib/terminal-vocab';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useLevelSubmission } from '../hooks/useLevelSubmission';
import { gradeCiLevel } from '../lib/ci-grader';
import { createCiState, isHiddenCiFile, runCiCommand } from '../lib/ci-runtime';
import type { CiConclusion, CiRunRecord, CiState } from '../lib/ci-types';
import type { LevelMeta } from '../lib/content-loader';
import { loadWorkspaceFiles, saveWorkspaceFiles } from '../lib/virtual-files';
import CheckResultsPanel from './CheckResultsPanel';
import { ResetControl } from './CraftWorkspaceParts';
import styles from './CiWorkspace.module.css';
import { useSubmitShortcut, submitButtonProps } from '../hooks/useSubmitShortcut';

interface Props { level: LevelMeta; hintsUsed: number; onPassed: () => void }

const META_KEY = '__fde_ci_state__';
const BANNER = 'CI simulator ready. Edit the files, then press "Run workflow" (a push to main). Type help for more commands.\n';

function starterFiles(level: LevelMeta): Record<string, string> {
  const initial: Record<string, string> = {};
  for (const file of level.starter_files ?? []) initial[file.path] = file.content ?? '';
  return initial;
}

function mark(conclusion: CiConclusion | null, status: string): { symbol: string; className: string | undefined; text: string } {
  if (conclusion === 'success') return { symbol: '✓', className: styles.ok, text: 'passed' };
  if (conclusion === 'failure') return { symbol: '✗', className: styles.bad, text: 'failed' };
  if (conclusion === 'cancelled') return { symbol: '⊘', className: styles.bad, text: 'cancelled' };
  if (conclusion === 'skipped') return { symbol: '–', className: styles.skip, text: 'skipped' };
  return { symbol: '…', className: styles.wait, text: status === 'waiting' ? 'waiting for approval' : status };
}

function RunCard({ run, open, onApprove, onReject }: { run: CiRunRecord; open: boolean; onApprove: () => void; onReject: () => void }) {
  const overall = mark(run.conclusion, run.status);
  const waiting = run.jobs.filter((job) => job.status === 'waiting');
  return (
    <details className={styles.run} open={open}>
      <summary>
        <span className={overall.className} aria-hidden="true">{overall.symbol}</span>
        <span>{run.workflowName} #{run.number}</span>
        <span className={styles.meta}>{run.event} on {run.branch} · {run.title || 'no message'} · {overall.text}</span>
      </summary>
      {run.annotations.map((note, index) => <p key={index} className={styles.note}>{note}</p>)}
      <div className={styles.jobs}>
        {run.jobs.map((job) => {
          const state = mark(job.conclusion, job.status);
          return (
            <details key={job.id} className={styles.job} open={job.conclusion === 'failure'}>
              <summary>
                <span className={state.className} aria-hidden="true">{state.symbol}</span> {job.name}
                <span className={styles.meta}> · {state.text}{job.environment ? ` · environment ${job.environment}` : ''}{job.seconds ? ` · ${job.seconds}s` : ''}</span>
              </summary>
              {job.annotations.map((note, index) => <p key={index} className={styles.note}>{note}</p>)}
              <ul className={styles.steps}>
                {job.steps.map((step, index) => {
                  const result = mark(step.conclusion, 'completed');
                  return (
                    <li key={index} className={styles.step}>
                      <details open={step.conclusion === 'failure'}>
                        <summary><span className={result.className} aria-hidden="true">{result.symbol}</span> {step.name}<span className="sr-only"> {result.text}</span></summary>
                        {step.log.length > 0 && <pre className={styles.stepLog}>{step.log.join('\n')}</pre>}
                      </details>
                    </li>
                  );
                })}
              </ul>
            </details>
          );
        })}
      </div>
      {waiting.length > 0 && (
        <div className={styles.approve} role="group" aria-label="Deployment review">
          <span>Waiting for review: {[...new Set(waiting.map((job) => job.environment))].join(', ')}. You are the reviewer.</span>
          <button type="button" className="btn btn-primary" onClick={onApprove}>Approve</button>
          <button type="button" className="btn btn-secondary" onClick={onReject}>Reject</button>
        </div>
      )}
    </details>
  );
}

export default function CiWorkspace({ level, hintsUsed, onPassed }: Props) {
  const { user } = useAuth();
  const fileKey = (user?.id ?? 'guest') + ':' + level.id + ':ci';
  const stateRef = useRef<CiState>(createCiState(starterFiles(level)));
  const [ready, setReady] = useState(false);
  const [activeFile, setActiveFile] = useState('');
  const [command, setCommand] = useState('');
  const [history, setHistory] = useState<string[]>([]);
  const { onKeyDown, reset: resetHistory } = useTerminalInput({ value: command, setValue: setCommand, phrases: CI_COMMANDS, history });
  const [transcript, setTranscript] = useState(BANNER);
  const [, setRevision] = useState(0);
  const { submit, status, passStats, results, clearResults } = useLevelSubmission({ levelId: level.id, hintsUsed, onPassed });

  const persist = useCallback(async (snapshot: CiState) => {
    await saveWorkspaceFiles(fileKey, { ...snapshot.files, [META_KEY]: JSON.stringify({ ...snapshot, files: {} }) });
  }, [fileKey]);

  const hydrate = useCallback(async (fresh: boolean) => {
    const initial = starterFiles(level);
    if (fresh) await saveWorkspaceFiles(fileKey, {});
    const stored = fresh ? initial : await loadWorkspaceFiles(fileKey, initial);
    const { [META_KEY]: metadata, ...files } = stored;
    const next = createCiState(files);
    let text = BANNER;
    if (metadata) {
      try {
        const saved = JSON.parse(metadata) as CiState;
        Object.assign(next, saved, { files: next.files });
        text = BANNER + saved.history.map((line) => '$ ' + line).join('\n') + (saved.history.length ? '\n' + saved.stdout + saved.stderr : '');
      } catch { /* Keep the starter state when saved state is invalid. */ }
    }
    stateRef.current = next;
    const names = Object.keys(next.files).filter((path) => !isHiddenCiFile(path));
    setActiveFile(names.find((path) => path.startsWith('.github/workflows/')) ?? names[0] ?? '');
    setTranscript(text);
    setCommand('');
    clearResults();
    setRevision((version) => version + 1);
    setReady(true);
  }, [clearResults, fileKey, level]);

  useEffect(() => {
    setReady(false);
    void hydrate(false);
  }, [hydrate]);

  const editFile = (value: string) => {
    const next = { ...stateRef.current, files: { ...stateRef.current.files, [activeFile]: value } };
    stateRef.current = next;
    setRevision((version) => version + 1);
    void persist(next);
    clearResults();
  };

  const execute = (line: string) => {
    const text = line.trim();
    if (!text) return;
    const result = runCiCommand(stateRef.current, text);
    stateRef.current = result.state;
    const printed = '$ ' + text + '\n' + (result.stdout + result.stderr || '');
    setTranscript((previous) => (previous + printed).split('\n').slice(-200).join('\n'));
    setCommand('');
    setHistory((h) => [...h, text].slice(-100));
    resetHistory();
    clearResults();
    setRevision((version) => version + 1);
    void persist(result.state);
  };

  const grade = async () => {
    await submit(gradeCiLevel(level.checks, stateRef.current));
  };

  useSubmitShortcut(grade, true);
  if (!ready) return <div className={styles.loading}>Starting the CI simulator…</div>;
  const state = stateRef.current;
  const files = Object.keys(state.files).filter((path) => !isHiddenCiFile(path)).sort();
  const runs = [...state.runs].reverse();

  return (
    <section className={styles.workspace} aria-label="CI/CD simulator workspace">
      <div className={styles.toolbar}>
        <strong>CI/CD · simulated GitHub Actions</strong>
        <button type="button" className="btn btn-secondary" onClick={() => execute('push main')}>Run workflow</button>
        <button type="button" className="btn btn-primary" {...submitButtonProps} onClick={() => void grade()}>Submit</button>
      </div>
      <div className={styles.tabs} role="tablist" aria-label="Repository files">
        {files.map((file) => (
          <button key={file} type="button" role="tab" aria-selected={file === activeFile} className={styles.tab} onClick={() => setActiveFile(file)}>{file}</button>
        ))}
      </div>
      <CodeEditor className={styles.editor} ariaLabel={'Edit ' + activeFile} path={activeFile} value={state.files[activeFile] ?? ''} onChange={editFile} />
      <form className={styles.commandRow} onSubmit={(event) => { event.preventDefault(); execute(command); }}>
        <label htmlFor="ci-command">$</label>
        <input id="ci-command" aria-label="CI command" value={command} onChange={(event) => setCommand(event.target.value)} onKeyDown={onKeyDown} placeholder="push main, pr feature/x, tag v1.4.0, dispatch" autoComplete="off" />
        <button className="btn btn-secondary" type="submit">Run</button>
      </form>
      <p className={styles.help}>Everything runs in simulation in your browser. Nothing is pushed to GitHub and no real secrets are used.</p>
      <h3 className={styles.panelTitle}>Terminal</h3>
      <pre className={styles.terminal} aria-label="CI terminal output" aria-live="polite">{transcript}</pre>
      <h3 className={styles.panelTitle}>Workflow runs</h3>
      {runs.length === 0 ? <p className={styles.empty}>No runs yet. Press Run workflow to push your files.</p> : (
        <div className={styles.runs}>
          {runs.map((run, index) => <RunCard key={run.id} run={run} open={index === 0} onApprove={() => execute('approve')} onReject={() => execute('reject')} />)}
        </div>
      )}
      <div className={styles.footer}>
        <ResetControl onReset={() => { void hydrate(true); }} />
      </div>
      <CheckResultsPanel results={results} status={status} stats={passStats} />
    </section>
  );
}
