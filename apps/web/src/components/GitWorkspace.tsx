import { useCallback, useEffect, useMemo, useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { gradeGitLevel, type GitRemoteState } from '../lib/git-grader';
import { getGitSnapshot, initializeGitWorkspace, mergeGitBranches, runGitCommand, writeGitFile, type GitSnapshot } from '../lib/git-runtime';
import { getProgress, saveProgress } from '../lib/progress';
import { loadWorkspaceFiles, saveWorkspaceFiles } from '../lib/virtual-files';
import type { LevelMeta } from '../lib/content-loader';
import styles from './GitWorkspace.module.css';

interface GitWorkspaceProps { level: LevelMeta; hintsUsed: number; onPassed: () => void }
const REMOTE_KEY_PREFIX = 'fde-git-remote:';
const emptyRemote: GitRemoteState = { pullRequests: [] };

export default function GitWorkspace({ level, hintsUsed, onPassed }: GitWorkspaceProps) {
  const { user, session } = useAuth();
  const workspaceKey = `${user?.id ?? 'guest'}:${level.id}`;
  const remoteKey = `${REMOTE_KEY_PREFIX}${workspaceKey}`;
  const [snapshot, setSnapshot] = useState<GitSnapshot | null>(null);
  const [remote, setRemote] = useState<GitRemoteState>(emptyRemote);
  const [selectedFile, setSelectedFile] = useState('README.md');
  const [draft, setDraft] = useState('');
  const [command, setCommand] = useState('');
  const [output, setOutput] = useState('Welcome to the Git practice workspace. Type `git help` to see commands.\n');
  const [busy, setBusy] = useState(false);
  const [checks, setChecks] = useState<ReturnType<typeof gradeGitLevel> | null>(null);
  const [message, setMessage] = useState('');
  const [attempts, setAttempts] = useState(0);

  const refresh = useCallback(async () => {
    setSnapshot(await getGitSnapshot(workspaceKey));
  }, [workspaceKey]);

  useEffect(() => {
    let active = true;
    const starter: Record<string, string> = {};
    for (const file of level.starter_files ?? []) starter[file.path] = file.content ?? '';
    void initializeGitWorkspace(workspaceKey, starter, level.order >= 3).then(async (next) => {
      const saved = await loadWorkspaceFiles(remoteKey, { 'remote.json': JSON.stringify(emptyRemote) });
      let nextRemote = emptyRemote;
      try { nextRemote = JSON.parse(saved['remote.json'] ?? '') as GitRemoteState; } catch { /* Use an empty simulated remote. */ }
      if (!active) return;
      setRemote(nextRemote);
      setSnapshot(next);
      setSelectedFile(next.files[0]?.path ?? '');
    }).catch((error: Error) => setMessage(error.message));
    return () => { active = false; };
  }, [level, remoteKey, workspaceKey]);

  useEffect(() => {
    setDraft(snapshot?.files.find((file) => file.path === selectedFile)?.content ?? '');
  }, [selectedFile, snapshot]);

  const persistRemote = useCallback(async (next: GitRemoteState) => {
    setRemote(next);
    await saveWorkspaceFiles(remoteKey, { 'remote.json': JSON.stringify(next) });
  }, [remoteKey]);

  const execute = useCallback(async (raw: string) => {
    const input = raw.trim();
    if (!input) return;
    setOutput((current) => `${current}\n$ ${input}\n`);
    setCommand('');
    setBusy(true);
    try {
      const result = await runGitCommand(workspaceKey, input);
      setOutput((current) => `${current}${result}\n`);
      setMessage('');
      setChecks(null);
      await refresh();
    } catch (error) {
      setOutput((current) => `${current}\u001b[31m${(error as Error).message}\u001b[0m\n`);
      await refresh();
    } finally { setBusy(false); }
  }, [refresh, workspaceKey]);

  const saveFile = useCallback(async () => {
    if (!selectedFile) return;
    await writeGitFile(workspaceKey, selectedFile, draft);
    await refresh();
    setOutput((current) => `${current}\nSaved ${selectedFile}. Stage and commit it when you’re ready.\n`);
    setChecks(null);
  }, [draft, refresh, selectedFile, workspaceKey]);

  const createPullRequest = useCallback(async () => {
    if (!snapshot || snapshot.branch === 'main') return;
    await execute('git push origin');
    const existing = remote.pullRequests.find((pr) => pr.head === snapshot.branch);
    const pr = existing ?? { id: Date.now(), title: `Merge ${snapshot.branch} into main`, head: snapshot.branch, base: 'main', approved: false, merged: false };
    await persistRemote({ pullRequests: [...remote.pullRequests.filter((item) => item.head !== pr.head), pr] });
    setOutput((current) => `${current}\nOpened pull request #${pr.id}: ${pr.title}\n`);
  }, [execute, persistRemote, remote.pullRequests, snapshot]);

  const approvePullRequest = useCallback(async (id: number) => {
    await persistRemote({ pullRequests: remote.pullRequests.map((pr) => pr.id === id ? { ...pr, approved: true } : pr) });
  }, [persistRemote, remote.pullRequests]);

  const mergePullRequest = useCallback(async (id: number) => {
    const pr = remote.pullRequests.find((item) => item.id === id);
    if (!pr) return;
    setBusy(true);
    try {
      await mergeGitBranches(workspaceKey, pr.base, pr.head);
      await persistRemote({ pullRequests: remote.pullRequests.map((item) => item.id === id ? { ...item, merged: true } : item) });
      setOutput((current) => `${current}\nPull request #${id} merged into ${pr.base}.\n`);
      await refresh();
    } catch (error) { setMessage((error as Error).message); }
    finally { setBusy(false); }
  }, [persistRemote, refresh, remote.pullRequests, workspaceKey]);

  const submit = useCallback(async () => {
    if (!snapshot) return;
    setBusy(true);
    try {
      const results = gradeGitLevel(level.checks, await getGitSnapshot(workspaceKey), remote);
      setChecks(results);
      const passed = results.length > 0 && results.every((result) => result.passed);
      const nextAttempts = attempts + 1;
      setAttempts(nextAttempts);
      if (session?.access_token) {
        let synced = true;
        try {
          await saveProgress(session.access_token, { level_id: level.id, status: passed ? 'passed' : 'in_progress', attempts: nextAttempts, hints_used: hintsUsed, time_spent_sec: 0 });
        } catch { synced = false; }
        if (passed) onPassed();
        setMessage(passed ? synced ? 'Level passed. Your progress is saved.' : 'Checks passed, but progress could not sync. Your work is saved on this device.' : 'Keep going. Your Git repository is saved on this device.');
      } else {
        setMessage(passed ? 'Checks passed. Sign in to sync progress across devices.' : 'Keep going. Your Git repository is saved on this device.');
      }
    } catch (error) { setMessage((error as Error).message); }
    finally { setBusy(false); }
  }, [attempts, hintsUsed, level.checks, level.id, onPassed, remote, session?.access_token, snapshot, workspaceKey]);

  const activeFile = useMemo(() => snapshot?.files.find((file) => file.path === selectedFile), [selectedFile, snapshot]);
  const passed = checks?.length ? checks.every((check) => check.passed) : false;

  return (
    <section className={styles.workspace} aria-label="Git practice workspace">
      <div className={styles.toolbar}>
        <div><strong>Git workspace</strong><span className={styles.branch}>{snapshot?.branch ? `⎇ ${snapshot.branch}` : 'Starting repository…'}</span></div>
        <div className={styles.actions}><button className="btn btn-secondary" onClick={() => void refresh()}>Refresh</button><button className="btn btn-primary" disabled={busy || !snapshot} onClick={() => void submit()}>Submit</button></div>
      </div>
      {snapshot?.conflicts && <div className={styles.conflictNotice} role="status">Merge conflict detected. Edit the file to remove conflict markers, save it, then stage and commit the resolution.</div>}
      <div className={styles.main}>
        <div className={styles.editorPane}>
          <div className={styles.fileTabs}>{snapshot?.files.map((file) => <button key={file.path} className={file.path === selectedFile ? styles.activeFile : ''} onClick={() => setSelectedFile(file.path)}>{file.path}</button>)}</div>
          {activeFile ? <><textarea aria-label={`Edit ${selectedFile}`} className={styles.editor} value={draft} onChange={(event) => setDraft(event.target.value)} spellCheck={false} /><div className={styles.fileFooter}><span>{selectedFile}</span><button className="btn btn-secondary" onClick={() => void saveFile()}>Save file</button></div></> : <div className={styles.empty}>No files in this repository yet.</div>}
        </div>
        <div className={styles.terminalPane}>
          <div className={styles.terminalHeader}>Terminal · Git runs locally in this browser</div>
          <pre className={styles.output} aria-live="polite">{output}</pre>
          <form className={styles.commandForm} onSubmit={(event) => { event.preventDefault(); void execute(command); }}>
            <label htmlFor="git-command">learner@fde:{snapshot?.branch ?? 'repo'} $</label>
            <input id="git-command" value={command} onChange={(event) => setCommand(event.target.value)} placeholder="git status" disabled={busy} autoComplete="off" />
            <button className="btn btn-secondary" disabled={busy || !command.trim()}>Run</button>
          </form>
        </div>
      </div>
      <div className={styles.remote}>
        <div><h3>Simulated remote · Pull requests</h3><p>Push and review branches here. No GitHub account or network access is used.</p></div>
        {snapshot?.branch && snapshot.branch !== 'main' && <button className="btn btn-secondary" disabled={busy} onClick={() => void createPullRequest()}>Push &amp; open pull request</button>}
        {remote.pullRequests.map((pr) => <article key={pr.id} className={styles.prCard}><div><strong>#{pr.id} {pr.title}</strong><small>{pr.merged ? 'Merged' : pr.approved ? 'Approved' : 'Awaiting review'}</small></div><div className={styles.actions}>{!pr.approved && !pr.merged && <button className="btn btn-secondary" onClick={() => void approvePullRequest(pr.id)}>Approve</button>}{pr.approved && !pr.merged && <button className="btn btn-primary" disabled={busy} onClick={() => void mergePullRequest(pr.id)}>Merge</button>}</div></article>)}
      </div>
      {snapshot && <details className={styles.statusDetails}><summary>Repository status · {snapshot.commits.length} commit(s) · {snapshot.branches.length} branch(es)</summary><p>{snapshot.status.length ? snapshot.status.map((row) => row.path).join(', ') : 'No changed files.'}</p><ol>{snapshot.commits.slice(0, 8).map((commit) => <li key={commit.oid}><code>{commit.oid.slice(0, 7)}</code> {commit.message}</li>)}</ol></details>}
      {checks && <div className={`${styles.checks} ${passed ? styles.passed : styles.failed}`} aria-live="polite"><h3>{passed ? 'All checks passed' : 'Some checks need work'}</h3>{checks.map((check, index) => <p key={`${check.label}-${index}`}>{check.passed ? '✓' : '×'} {check.label}{!check.passed && <><br /><code>Expected: {check.expected}</code><br /><code>Got: {check.actual}</code></>}</p>)}</div>}
      {message && <p className={styles.message} role="status">{message}</p>}
    </section>
  );
}
