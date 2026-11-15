import { plainString } from '../lib/plain-string';
import { useCallback, useEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useLevelSubmission } from '../hooks/useLevelSubmission';
import type { LevelMeta } from '../lib/content-loader';
import { BUILT_IN_RULES, evaluateAlert, sloStatus } from '../lib/observability/alerts';
import { gradeObservabilityLevel } from '../lib/observability/grader';
import {
  ALERT_FILE,
  createObservabilityState,
  parseScenarioConfig,
  runObservabilityQuery,
  telemetryFor,
  type ObservabilityState,
} from '../lib/observability/runtime';
import { clockMinute } from '../lib/observability/stats';
import { ROOT_CAUSE_OPTIONS, SERVICE_OPTIONS, type QueryKind, type QueryResult } from '../lib/observability/types';
import { loadWorkspaceFiles, saveWorkspaceFiles } from '../lib/virtual-files';
import CheckResultsPanel from './CheckResultsPanel';
import { LineChart, Waterfall } from './ObservabilityCharts';
import styles from './ObservabilityWorkspace.module.css';
import { useSubmitShortcut, submitButtonProps } from '../hooks/useSubmitShortcut';

interface Props { level: LevelMeta; hintsUsed: number; onPassed: () => void }
type Tab = QueryKind | 'alerts' | 'report';

const STATE_KEY = '__fde_observability_state__';
const TABS: { id: Tab; label: string }[] = [
  { id: 'logs', label: 'Logs' },
  { id: 'metrics', label: 'Metrics' },
  { id: 'traces', label: 'Traces' },
  { id: 'alerts', label: 'Alerts & SLOs' },
  { id: 'report', label: 'Incident report' },
];
const EXAMPLES: Record<QueryKind, string[]> = {
  logs: ['service:payments level:error | count by status', 'level:error | count by service', 'latency_ms:>1000 | stats count() by route', 'msg:"deploy finished"'],
  metrics: [
    'sum by (service) (rate(http_requests_total[5m]))',
    'sum(rate(http_requests_total{service="payments",status=~"5.."}[5m])) / sum(rate(http_requests_total{service="payments"}[5m]))',
    'histogram_quantile(0.95, sum by (le) (rate(http_request_duration_seconds_bucket{service="payments"}[5m])))',
    'process_resident_memory_bytes',
  ],
  traces: ['slowest 5', 'errors 5', 'slowest 5 route:/v1/invoices', 'service:payments status:>=500'],
};
const PLACEHOLDERS: Record<QueryKind, string> = {
  logs: 'service:payments level:error | count by status',
  metrics: 'rate(http_requests_total{service="payments"}[5m])',
  traces: 'slowest 5   or   trace <trace_id>',
};

interface AnswerField { key: string; prompt: string; options: string[] }

export default function ObservabilityWorkspace({ level, hintsUsed, onPassed }: Props) {
  const { user } = useAuth();
  const storageKey = (user?.id ?? 'guest') + ':' + level.id + ':observability';
  const { submit, status, passStats, results, clearResults, setStatus } = useLevelSubmission({ levelId: level.id, hintsUsed, onPassed });
  const starter = useMemo(() => Object.fromEntries((level.starter_files ?? []).map((file) => [file.path, file.content ?? ''])), [level.starter_files]);
  const config = useMemo(() => parseScenarioConfig(starter), [starter]);
  const [state, setState] = useState<ObservabilityState>(() => createObservabilityState(config, starter[ALERT_FILE] ?? ''));
  const [ready, setReady] = useState(false);
  const [tab, setTab] = useState<Tab>('logs');
  const [queries, setQueries] = useState<Record<QueryKind, string>>({ logs: '', metrics: '', traces: '' });
  const [outputs, setOutputs] = useState<Partial<Record<QueryKind, QueryResult>>>({});
  const [confirmReset, setConfirmReset] = useState(false);
  const tabRefs = useRef<Partial<Record<Tab, HTMLButtonElement | null>>>({});

  const checks = level.checks;
  const paths = useMemo(() => new Set(checks.map((check) => (typeof check.path === 'string' ? check.path : ''))), [checks]);
  const usesAlertRule = [...paths].some((path) => path.startsWith('alert:')) || ALERT_FILE in starter;
  const answerFields = useMemo<AnswerField[]>(() => {
    const seen = new Map<string, AnswerField>();
    for (const check of checks) {
      if (check.kind !== 'sim_state' || typeof check.path !== 'string' || !check.path.startsWith('answer:')) continue;
      const key = check.path.slice('answer:'.length);
      if (seen.has(key)) continue;
      seen.set(key, { key, prompt: plainString(check.prompt ?? check.label ?? key), options: Array.isArray(check.options) ? check.options.map(String) : [] });
    }
    return [...seen.values()];
  }, [checks]);

  // Hydrate saved learner state for this level.
  useEffect(() => {
    let active = true;
    setReady(false);
    void loadWorkspaceFiles(storageKey, {}).then((stored) => {
      if (!active) return;
      let next = createObservabilityState(config, starter[ALERT_FILE] ?? '');
      const raw = stored[STATE_KEY];
      if (raw) {
        try {
          const saved = JSON.parse(raw) as Partial<ObservabilityState>;
          next = { ...next, history: Array.isArray(saved.history) ? saved.history.map(String) : [], report: { ...next.report, ...saved.report }, answers: { ...saved.answers }, alertRule: typeof saved.alertRule === 'string' ? saved.alertRule : next.alertRule };
        } catch { /* Ignore corrupt saved state and start fresh. */ }
      }
      setState(next);
      setOutputs({});
      setReady(true);
    });
    return () => { active = false; };
  }, [config, starter, storageKey]);

  const update = useCallback((next: ObservabilityState) => {
    setState(next);
    clearResults();
    const persisted: Partial<ObservabilityState> = { ...next };
    delete persisted.lastOutput;
    delete persisted.lastError;
    void saveWorkspaceFiles(storageKey, { [STATE_KEY]: JSON.stringify(persisted) });
  }, [clearResults, storageKey]);

  const telemetry = useMemo(() => telemetryFor(state), [state.scenario, state.seed]);
  const slos = useMemo(() => sloStatus(telemetry), [telemetry]);
  const builtIn = useMemo(() => BUILT_IN_RULES.map((rule) => evaluateAlert(telemetry, rule)), [telemetry]);
  const learnerAlert = useMemo(() => (usesAlertRule && state.alertRule.trim() ? evaluateAlert(telemetry, state.alertRule) : null), [telemetry, state.alertRule, usesAlertRule]);

  const run = (kind: QueryKind, text?: string) => {
    const query = (text ?? queries[kind]).trim();
    if (!query) return;
    if (text !== undefined) setQueries((previous) => ({ ...previous, [kind]: text }));
    const { state: next, result } = runObservabilityQuery(state, kind, query);
    setOutputs((previous) => ({ ...previous, [kind]: result }));
    update(next);
  };

  const onTabKey = (event: KeyboardEvent<HTMLButtonElement>, index: number) => {
    if (event.key !== 'ArrowRight' && event.key !== 'ArrowLeft' && event.key !== 'Home' && event.key !== 'End') return;
    event.preventDefault();
    const nextIndex = event.key === 'Home' ? 0 : event.key === 'End' ? TABS.length - 1 : (index + (event.key === 'ArrowRight' ? 1 : -1) + TABS.length) % TABS.length;
    const nextTab = TABS[nextIndex]!.id;
    setTab(nextTab);
    tabRefs.current[nextTab]?.focus();
  };

  const onSubmit = async () => {
    await submit(gradeObservabilityLevel(level.checks, state));
  };

  const reset = () => {
    const fresh = createObservabilityState(config, starter[ALERT_FILE] ?? '');
    setQueries({ logs: '', metrics: '', traces: '' });
    setOutputs({});
    setConfirmReset(false);
    update(fresh);
    setStatus('Level reset. Your queries and report were cleared.');
  };

  useSubmitShortcut(onSubmit, true);
  if (!ready) return <div className={styles.loading}>Loading telemetry…</div>;

  const renderQueryTab = (kind: QueryKind) => {
    const output = outputs[kind];
    return (
      <div className={styles.panelBody}>
        <form className={styles.queryBar} onSubmit={(event) => { event.preventDefault(); run(kind); }}>
          <label htmlFor={`obs-query-${kind}`} className="sr-only">{kind} query</label>
          <input
            id={`obs-query-${kind}`}
            value={queries[kind]}
            onChange={(event) => setQueries((previous) => ({ ...previous, [kind]: event.target.value }))}
            placeholder={PLACEHOLDERS[kind]}
            autoComplete="off"
            spellCheck={false}
            aria-describedby={`obs-help-${kind}`}
          />
          <button type="submit" className="btn btn-secondary">Run</button>
        </form>
        <div className={styles.examples} id={`obs-help-${kind}`} aria-label="Example queries">
          <span>Try:</span>
          {EXAMPLES[kind].map((example) => (
            <button type="button" key={example} className={styles.chip} onClick={() => run(kind, example)}>{example}</button>
          ))}
        </div>
        {output && !output.ok && <p className={styles.error} role="alert">{output.text}</p>}
        {output?.ok && output.chart && output.chart.length > 0 && kind !== 'traces' && (
          <LineChart series={output.chart} title={kind === 'logs' ? 'Matching log lines per minute' : 'Query result'} />
        )}
        {output?.ok && output.waterfall && <Waterfall spans={output.waterfall} />}
        {output?.ok && <pre className={styles.output} tabIndex={0} aria-label={`${kind} query output`}>{output.text}</pre>}
        {!output && <p className={styles.muted}>Time range: today 10:00–10:59 IST. Run a query to see results.</p>}
      </div>
    );
  };

  return (
    <section className={styles.workspace} aria-label="Observability workspace">
      <header className={styles.toolbar}>
        <div>
          <strong>Observability · payments platform (simulated)</strong>
          <span className={styles.muted}> api-gateway → payments (UPI) · invoices (GST)</span>
        </div>
        <div className={styles.actions}>
          {confirmReset ? (
            <span className={styles.confirm} role="group" aria-label="Confirm reset">
              <span>Clear queries and report?</span>
              <button type="button" className="btn btn-secondary" onClick={reset}>Yes, reset</button>
              <button type="button" className="btn btn-secondary" onClick={() => setConfirmReset(false)} autoFocus>Cancel</button>
            </span>
          ) : (
            <button type="button" className="btn btn-secondary" onClick={() => setConfirmReset(true)}>Reset level</button>
          )}
          <button type="button" className="btn btn-primary" {...submitButtonProps} onClick={() => void onSubmit()}>Submit</button>
        </div>
      </header>

      <div role="tablist" aria-label="Telemetry views" className={styles.tabs}>
        {TABS.map((item, index) => (
          <button
            key={item.id}
            ref={(element) => { tabRefs.current[item.id] = element; }}
            role="tab"
            id={`obs-tab-${item.id}`}
            aria-selected={tab === item.id}
            aria-controls={`obs-panel-${item.id}`}
            tabIndex={tab === item.id ? 0 : -1}
            className={tab === item.id ? styles.tabActive : styles.tab}
            onClick={() => setTab(item.id)}
            onKeyDown={(event) => onTabKey(event, index)}
          >
            {item.label}
          </button>
        ))}
      </div>

      <div role="tabpanel" id={`obs-panel-${tab}`} aria-labelledby={`obs-tab-${tab}`} className={styles.panel}>
        {(tab === 'logs' || tab === 'metrics' || tab === 'traces') && renderQueryTab(tab)}

        {tab === 'alerts' && (
          <div className={styles.panelBody}>
            <h3 className={styles.sectionTitle}>Service level objectives</h3>
            <div className={styles.tableWrap}>
              <table className={styles.table}>
                <thead><tr><th scope="col">SLO</th><th scope="col">Objective</th><th scope="col">Bad ratio (1h)</th><th scope="col">Burn rate (1h)</th><th scope="col">Burn rate (5m)</th><th scope="col">30-day budget spent this hour</th></tr></thead>
                <tbody>
                  {slos.map((item) => (
                    <tr key={item.slo.name}>
                      <th scope="row" title={item.slo.description}>{item.slo.name}</th>
                      <td>{(item.slo.objective * 100).toFixed(1)}% / {item.slo.window_days}d</td>
                      <td>{(item.badRatio1h * 100).toFixed(2)}%</td>
                      <td className={item.burnRate1h > 14.4 ? styles.bad : item.burnRate1h > 1 ? styles.warn : undefined}>{item.burnRate1h}×</td>
                      <td>{item.burnRate5m}×</td>
                      <td>{item.budgetSpentPct}%</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <h3 className={styles.sectionTitle}>On-call notifications</h3>
            <ul className={styles.alertList}>
              {builtIn.map((evaluation) => (
                <li key={evaluation.rule?.name ?? evaluation.error}>
                  <code>{evaluation.rule?.name}</code> <span className={styles.muted}>({evaluation.rule?.severity}, for {evaluation.rule?.forMinutes}m)</span>{' '}
                  {evaluation.episodes.length === 0 ? <span className={styles.ok}>OK · never fired</span> : evaluation.episodes.map((episode) => (
                    <span key={episode.start} className={styles.firing}>FIRING {clockMinute(episode.start)}–{clockMinute(episode.end)}</span>
                  ))}
                </li>
              ))}
            </ul>
            {usesAlertRule && (
              <>
                <h3 className={styles.sectionTitle}><label htmlFor="obs-alert-rule">Your alert rule</label></h3>
                <textarea
                  id="obs-alert-rule"
                  className={styles.editor}
                  value={state.alertRule}
                  spellCheck={false}
                  rows={6}
                  onChange={(event) => update({ ...state, alertRule: event.target.value })}
                />
                <p className={styles.muted}>The rule is replayed over the hour below. A good page fires during real user pain and stays quiet otherwise.</p>
                {learnerAlert && !learnerAlert.valid && <p className={styles.error} role="alert">{learnerAlert.error}</p>}
                {learnerAlert?.valid && (
                  <div aria-live="polite">
                    <div className={styles.timeline} role="img" aria-label={`Rule fired ${learnerAlert.episodes.length} times`}>
                      {learnerAlert.firing.map((active, minute) => (
                        <span key={minute} title={clockMinute(minute)} className={active ? styles.timelineFiring : learnerAlert.pending[minute] ? styles.timelinePending : styles.timelineIdle} />
                      ))}
                    </div>
                    <p className={styles.muted}>
                      Fired {learnerAlert.episodes.length} time(s): {learnerAlert.episodes.map((episode) => `${clockMinute(episode.start)}–${clockMinute(episode.end)}`).join(', ') || 'never'}.
                      {' '}Red = firing, amber = condition true but still pending.
                    </p>
                  </div>
                )}
              </>
            )}
          </div>
        )}

        {tab === 'report' && (
          <form className={styles.panelBody} onSubmit={(event) => { event.preventDefault(); void onSubmit(); }}>
            {paths.has('report.root_cause') && (
              <div className={styles.field}>
                <label htmlFor="obs-root-cause">Root cause</label>
                <select id="obs-root-cause" value={state.report.rootCause} onChange={(event) => update({ ...state, report: { ...state.report, rootCause: event.target.value } })}>
                  <option value="">Choose the root cause…</option>
                  {ROOT_CAUSE_OPTIONS.map((option) => <option key={option.id} value={option.id}>{option.label}</option>)}
                </select>
              </div>
            )}
            {paths.has('report.service') && (
              <div className={styles.field}>
                <label htmlFor="obs-service">Service where the problem starts</label>
                <select id="obs-service" value={state.report.service} onChange={(event) => update({ ...state, report: { ...state.report, service: event.target.value } })}>
                  <option value="">Choose a service…</option>
                  {SERVICE_OPTIONS.map((service) => <option key={service} value={service}>{service}</option>)}
                </select>
              </div>
            )}
            {answerFields.map((field) => (
              <div className={styles.field} key={field.key}>
                <label htmlFor={`obs-answer-${field.key}`}>{field.prompt}</label>
                {field.options.length > 0 ? (
                  <select id={`obs-answer-${field.key}`} value={state.answers[field.key] ?? ''} onChange={(event) => update({ ...state, answers: { ...state.answers, [field.key]: event.target.value } })}>
                    <option value="">Choose…</option>
                    {field.options.map((option) => <option key={option} value={option}>{option}</option>)}
                  </select>
                ) : (
                  <input id={`obs-answer-${field.key}`} value={state.answers[field.key] ?? ''} autoComplete="off" spellCheck={false} onChange={(event) => update({ ...state, answers: { ...state.answers, [field.key]: event.target.value } })} />
                )}
              </div>
            ))}
            {paths.has('report.evidence') && (
              <div className={styles.field}>
                <label htmlFor="obs-evidence">Evidence (queries, numbers, trace ids)</label>
                <textarea id="obs-evidence" rows={5} value={state.report.evidence} onChange={(event) => update({ ...state, report: { ...state.report, evidence: event.target.value } })} placeholder="At 10:33 db_pool_connections_in_use hit 20 of 20 ..." />
              </div>
            )}
            {!paths.has('report.root_cause') && !paths.has('report.service') && !paths.has('report.evidence') && answerFields.length === 0 && (
              <p className={styles.muted}>This level is graded from your queries{usesAlertRule ? ' and alert rule' : ''}. Press Submit when you are ready.</p>
            )}
            <p className={styles.muted}>{state.history.length} queries run so far. Submit grades your report and query history.</p>
          </form>
        )}
      </div>

      <CheckResultsPanel results={results} status={status} stats={passStats} />
    </section>
  );
}
