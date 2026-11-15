import { useEffect, useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useLevelSubmission, type SubmissionCheckResult } from '../hooks/useLevelSubmission';
import type { LevelMeta } from '../lib/content-loader';
import CheckResultsPanel from './CheckResultsPanel';
import styles from './RealWorldWorkspace.module.css';
import { useSubmitShortcut, submitButtonProps } from '../hooks/useSubmitShortcut';

interface Props { level: LevelMeta; hintsUsed: number; onPassed: () => void }

interface RealCheck {
  kind: string;
  label?: string;
  url_field?: string;
  expect_status?: number;
  contains?: string;
  require_file?: string;
  workflow_success?: boolean;
}

interface ApiCheck { name: string; passed: boolean; expected: string; actual: string }
interface ApiResult { passed?: boolean; error?: string; checks?: ApiCheck[] }

const API_URL = import.meta.env.VITE_API_URL;

/**
 * Real-world levels: the learner deploys something real, then the platform
 * checks it from the server (live URL, public GitHub repo, local checker CLI).
 */
export default function RealWorldWorkspace({ level, hintsUsed, onPassed }: Props) {
  const { session, user } = useAuth();
  const token = session?.access_token;
  const storageKey = `fde-realworld:${user?.id ?? 'guest'}:${level.id}`;
  const { submit, status, passStats, results, setStatus } = useLevelSubmission({ levelId: level.id, hintsUsed, onPassed });
  const [url, setUrl] = useState('');
  const [repo, setRepo] = useState('');
  const [running, setRunning] = useState(false);
  const [checkerToken, setCheckerToken] = useState<string | null>(null);

  const checks = level.checks as unknown as RealCheck[];
  const needsUrl = checks.some((check) => check.kind === 'live_url');
  const needsRepo = checks.some((check) => check.kind === 'github_repo');
  const needsChecker = checks.some((check) => check.kind === 'checker_token');

  useEffect(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(storageKey) ?? '{}') as { url?: string; repo?: string };
      setUrl(saved.url ?? '');
      setRepo(saved.repo ?? '');
    } catch {
      setUrl('');
      setRepo('');
    }
  }, [storageKey]);

  useEffect(() => {
    try { localStorage.setItem(storageKey, JSON.stringify({ url, repo })); } catch { /* storage unavailable */ }
  }, [repo, storageKey, url]);

  async function post<T>(path: string, body: unknown): Promise<T & { status: number }> {
    const res = await fetch(`${API_URL ?? ''}${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token ?? ''}` },
      body: JSON.stringify(body),
    });
    const json = (await res.json().catch(() => ({}))) as T;
    return { ...json, status: res.status };
  }

  function toResults(check: RealCheck, data: ApiResult, fallbackLabel: string): SubmissionCheckResult[] {
    if (data.checks?.length) {
      return data.checks.map((item) => ({ kind: check.kind, label: item.name, passed: item.passed, expected: item.expected, actual: item.actual }));
    }
    return [{ kind: check.kind, label: check.label ?? fallbackLabel, passed: false, expected: 'check to run', actual: data.error ?? 'no response' }];
  }

  async function runChecks() {
    if (!API_URL || !token) {
      setStatus('Real-world checks run on the platform server. Sign in (and make sure the API is configured) to run them.');
      return;
    }
    setRunning(true);
    setStatus('');
    const all: SubmissionCheckResult[] = [];
    try {
      for (const check of checks) {
        if (check.kind === 'live_url') {
          const data = await post<ApiResult>('/checks/live-url', {
            url: url.trim(),
            level_id: level.id,
            expected_status: check.expect_status ?? 200,
            ...(check.contains ? { contains: check.contains } : {}),
          });
          all.push(...toResults(check, data, 'Live URL responds'));
        } else if (check.kind === 'github_repo') {
          const data = await post<ApiResult>('/checks/github', {
            repo: repo.trim(),
            level_id: level.id,
            ...(check.require_file ? { file: check.require_file } : {}),
            ...(check.workflow_success ? { workflow_success: true } : {}),
          });
          all.push(...toResults(check, data, 'GitHub repository'));
        } else if (check.kind === 'checker_token') {
          const res = await fetch(`${API_URL}/checker/results/${level.id}`, { headers: { Authorization: `Bearer ${token}` } });
          const data = (await res.json().catch(() => ({}))) as { found?: boolean; passed?: boolean; created_at?: string; error?: string };
          all.push({
            kind: check.kind,
            label: check.label ?? 'Checker results received',
            passed: Boolean(data.found && data.passed),
            expected: 'a passing run reported by your checker token',
            actual: data.error ?? (data.found ? `${data.passed ? 'passed' : 'failed'} at ${data.created_at ?? 'unknown time'}` : 'nothing received yet'),
          });
        }
      }
      await submit(all);
    } catch {
      setStatus('Could not reach the platform server. Check your connection and try again.');
    } finally {
      setRunning(false);
    }
  }

  async function issueToken() {
    if (!API_URL || !token) {
      setStatus('Sign in to get a checker token.');
      return;
    }
    const data = await post<{ token?: string; error?: string }>('/checker/token', {}).catch(() => ({ error: 'Could not reach the server.', status: 0 }));
    if ('token' in data && data.token) setCheckerToken(data.token);
    else setStatus(data.error ?? 'Could not issue a token.');
  }

  useSubmitShortcut(runChecks, !running);

  return (
    <div className={styles.workspace}>
      <div className={styles.intro}>
        <strong>Real-world level</strong>
        <p>Build and deploy this on your own machine and free hosting. When it is live, enter the details below and run the checks.</p>
      </div>
      <form
        className={styles.form}
        onSubmit={(event) => {
          event.preventDefault();
          void runChecks();
        }}
      >
        {needsUrl && (
          <label>
            Public URL
            <input type="url" inputMode="url" placeholder="https://your-app.example.com/health" value={url} onChange={(event) => setUrl(event.target.value)} required />
          </label>
        )}
        {needsRepo && (
          <label>
            GitHub repository (owner/name)
            <input type="text" placeholder="priya-dev/clinic-api" value={repo} onChange={(event) => setRepo(event.target.value)} required />
          </label>
        )}
        {needsChecker && (
          <div className={styles.checker}>
            <p>This level uses your checker token. Set it as an environment variable in your app or run the checker CLI with it.</p>
            <button type="button" className="btn btn-secondary btn-sm" onClick={() => void issueToken()}>Get a new checker token</button>
            {checkerToken && (
              <p>
                Copy it now, it is shown only once: <code>{checkerToken}</code>
              </p>
            )}
          </div>
        )}
        <button type="submit" className="btn btn-primary" {...submitButtonProps} disabled={running}>{running ? 'Checking…' : 'Run checks'}</button>
      </form>
      <CheckResultsPanel results={results} status={status} stats={passStats} />
    </div>
  );
}
