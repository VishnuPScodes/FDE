import { useCallback, useEffect, useMemo, useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { gradeHttpLevel } from '../lib/http-grader';
import { MOCK_WEBHOOK_SECRET, mockHttpRequest, scenarioForHttpLevel, signWebhookBody, type MockHttpExchange } from '../lib/http-simulator';
import { getProgress, saveProgress } from '../lib/progress';
import { loadWorkspaceFiles, saveWorkspaceFiles } from '../lib/virtual-files';
import type { LevelMeta } from '../lib/content-loader';
import styles from './HttpWorkspace.module.css';

interface HttpWorkspaceProps { level: LevelMeta; hintsUsed: number; onPassed: () => void }
const historyPrefix = 'fde-http-workspace:';

function initialPath(levelId: string): string {
  const scenario = scenarioForHttpLevel(levelId);
  if (scenario === 'webhook') return '/api/webhooks/orders';
  if (scenario === 'idempotency') return '/api/payments';
  if (levelId.endsWith('002')) return '/api/items?page=1&per_page=2';
  if (levelId.endsWith('003')) return '/api/rate-limited';
  if (levelId.endsWith('004')) return '/api/flaky';
  return '/api/health';
}

function initialBody(levelId: string): string {
  if (scenarioForHttpLevel(levelId) === 'webhook') return JSON.stringify({ event: 'order.created', delivery_id: 'delivery-demo-001', order_id: 'ord-1042' }, null, 2);
  if (scenarioForHttpLevel(levelId) === 'idempotency') return JSON.stringify({ amount: 49.99, currency: 'USD' }, null, 2);
  return '';
}

export default function HttpWorkspace({ level, hintsUsed, onPassed }: HttpWorkspaceProps) {
  const { user, session } = useAuth();
  const key = `${historyPrefix}${user?.id ?? 'guest'}:${level.id}`;
  const scenario = useMemo(() => scenarioForHttpLevel(level.id), [level.id]);
  const [method, setMethod] = useState(() => ['webhook', 'idempotency'].includes(scenarioForHttpLevel(level.id)) ? 'POST' : 'GET');
  const [path, setPath] = useState(() => initialPath(level.id));
  const [headersText, setHeadersText] = useState('{}');
  const [body, setBody] = useState(() => initialBody(level.id));
  const [history, setHistory] = useState<MockHttpExchange[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [busy, setBusy] = useState(false);
  const [checks, setChecks] = useState<ReturnType<typeof gradeHttpLevel> | null>(null);
  const [message, setMessage] = useState('');
  const [attempts, setAttempts] = useState(0);

  useEffect(() => {
    const postRequest = ['webhook', 'idempotency'].includes(scenarioForHttpLevel(level.id));
    setMethod(postRequest ? 'POST' : 'GET');
    setPath(initialPath(level.id));
    setHeadersText('{}');
    setBody(initialBody(level.id));
    setChecks(null);
  }, [level.id]);

  useEffect(() => {
    let active = true;
    setLoaded(false);
    void loadWorkspaceFiles(key, { 'history.json': '[]' }).then((files) => {
      let saved: MockHttpExchange[] = [];
      try { saved = JSON.parse(files['history.json'] ?? '[]') as MockHttpExchange[]; } catch { /* Reset damaged local history. */ }
      if (!active) return;
      setHistory(saved);
      setLoaded(true);
    });
    return () => { active = false; };
  }, [key]);

  const sendRequest = useCallback(async () => {
    if (!loaded || busy) return;
    let headers: Record<string, string>;
    try {
      const parsed: unknown = JSON.parse(headersText || '{}');
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('Headers must be a JSON object.');
      headers = Object.fromEntries(Object.entries(parsed).map(([name, value]) => [name, String(value)]));
    } catch (error) {
      setMessage((error as Error).message || 'Headers must be valid JSON.');
      return;
    }
    setBusy(true);
    setMessage('');
    try {
      const exchange = await mockHttpRequest(scenario, { method, path, headers, body }, history);
      const next = [...history, exchange];
      setHistory(next);
      setChecks(null);
      await saveWorkspaceFiles(key, { 'history.json': JSON.stringify(next) });
    } catch (error) {
      setMessage((error as Error).message);
    } finally { setBusy(false); }
  }, [body, busy, headersText, history, key, loaded, method, path, scenario]);

  const submit = useCallback(async () => {
    const results = gradeHttpLevel(level.checks, history);
    setChecks(results);
    const passed = results.length > 0 && results.every((result) => result.passed);
    const nextAttempts = attempts + 1;
    setAttempts(nextAttempts);
    let synced = true;
    if (session?.access_token) {
      try {
        await saveProgress(session.access_token, { level_id: level.id, status: passed ? 'passed' : 'in_progress', attempts: nextAttempts, hints_used: hintsUsed, time_spent_sec: 0 });
      } catch { synced = false; }
    }
    if (passed) onPassed();
    setMessage(passed ? session?.access_token ? synced ? 'Level passed. Your progress is saved.' : 'Checks passed, but progress could not sync. Your work is saved on this device.' : 'Checks passed. Sign in to sync progress across devices.' : 'Use the request console, then submit again when the checks match.');
  }, [attempts, hintsUsed, history, level.checks, level.id, onPassed, session?.access_token]);

  const latest = history.at(-1);
  const signCurrentWebhook = useCallback(async () => {
    try {
      const signature = await signWebhookBody(body);
      const parsed = JSON.parse(headersText || '{}') as Record<string, unknown>;
      setHeadersText(JSON.stringify({ ...parsed, 'X-FDE-Signature': signature }, null, 2));
      setMessage('Signature generated for this exact body. Changing the body invalidates it.');
    } catch (error) { setMessage((error as Error).message || 'Could not sign this payload.'); }
  }, [body, headersText]);

  return (
    <section className={styles.workspace} aria-label="HTTP practice workspace">
      <header className={styles.header}>
        <div><strong>Mock API client</strong><p>Requests stay inside this browser. No external service is contacted.</p></div>
        <button className="btn btn-primary" disabled={!loaded || busy} onClick={() => void submit()}>Submit</button>
      </header>
      <div className={styles.request}>
        <select aria-label="HTTP method" value={method} onChange={(event) => setMethod(event.target.value)}>
          {['GET', 'POST', 'PUT', 'PATCH', 'DELETE'].map((value) => <option key={value}>{value}</option>)}
        </select>
        <input aria-label="Request path" value={path} onChange={(event) => setPath(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter') void sendRequest(); }} />
        <button className="btn btn-secondary" disabled={!loaded || busy || !path.trim()} onClick={() => void sendRequest()}>{busy ? 'Sending…' : 'Send request'}</button>
      </div>
      <div className={styles.editors}>
        <label>Headers (JSON)<textarea value={headersText} onChange={(event) => setHeadersText(event.target.value)} spellCheck={false} />{scenario === 'webhook' && <><small>Demo signing secret: <code>{MOCK_WEBHOOK_SECRET}</code></small><button type="button" className="btn btn-secondary" onClick={() => void signCurrentWebhook()}>Generate HMAC signature</button></>}{scenario === 'idempotency' && <small>Set an <code>Idempotency-Key</code> header before sending a payment request.</small>}</label>
        <label>Request body<textarea value={body} onChange={(event) => setBody(event.target.value)} placeholder={'{"example": true}'} spellCheck={false} /></label>
      </div>
      <div className={styles.response} aria-live="polite">
        <div className={styles.responseBar}><strong>Response</strong>{latest && <><span className={latest.response.status >= 400 ? styles.badStatus : styles.goodStatus}>{latest.response.status} {latest.response.statusText}</span><span>{new Date(latest.createdAt).toLocaleTimeString()}</span></>}</div>
        {latest ? <><div className={styles.responseHeaders}>{Object.entries(latest.response.headers).map(([name, value]) => <div key={name}><code>{name}</code>: {value}</div>)}</div><pre>{JSON.stringify(latest.response.body, null, 2)}</pre></> : <p className={styles.empty}>Send a request to inspect its status, headers, and JSON body.</p>}
      </div>
      {history.length > 0 && <details className={styles.history}><summary>Request history ({history.length})</summary>{history.map((entry, index) => <div key={`${entry.createdAt}-${index}`}><code>{entry.request.method} {entry.request.path}</code><span className={entry.response.status >= 400 ? styles.badStatus : styles.goodStatus}>{entry.response.status}</span></div>)}</details>}
      {checks && <div className={`${styles.checks} ${checks.every((check) => check.passed) ? styles.passed : styles.failed}`} aria-live="polite"><h3>{checks.every((check) => check.passed) ? 'All checks passed' : 'Some checks need work'}</h3>{checks.map((check, index) => <p key={`${check.label}-${index}`}>{check.passed ? '✓' : '×'} {check.label}{!check.passed && <><br /><code>Expected: {check.expected}</code><br /><code>Got: {check.actual}</code></>}</p>)}</div>}
      {message && <p className={styles.message} role="status">{message}</p>}
    </section>
  );
}
