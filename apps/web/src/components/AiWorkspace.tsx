import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { useLevelSubmission } from '../hooks/useLevelSubmission';
import { AiError, getStreamingAiClient } from '../lib/ai/client';
import { estimateCost, estimateRequestTokens, formatInr, formatUsd } from '../lib/ai/estimate';
import { findPreset } from '../lib/ai/providers';
import { loadAiSettings } from '../lib/ai/settings-store';
import { gradeAiLevel } from '../lib/ai-grader';
import type { LevelMeta } from '../lib/content-loader';
import { loadStarterFile } from '../lib/content-loader';
import { loadWorkspaceFiles, saveWorkspaceFiles, type WorkspaceFiles } from '../lib/virtual-files';
import CheckResultsPanel from './CheckResultsPanel';
import styles from './AiWorkspace.module.css';
import { useSubmitShortcut, submitButtonProps } from '../hooks/useSubmitShortcut';

interface Props { level: LevelMeta; hintsUsed: number; onPassed: () => void }

interface PromptConfig {
  system?: string;
  temperature?: number;
  max_tokens?: number;
  json?: boolean;
  sample_user?: string;
}

function readPromptConfig(files: WorkspaceFiles): { config: PromptConfig; error: string } {
  const text = files['prompt.json'];
  if (text === undefined) return { config: {}, error: '' };
  try {
    const parsed = JSON.parse(text) as unknown;
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? { config: parsed, error: '' } : { config: {}, error: 'prompt.json must be a JSON object.' };
  } catch (error) {
    return { config: {}, error: `prompt.json is not valid JSON yet: ${error instanceof Error ? error.message : 'parse error'}` };
  }
}

/** Prompt playground for `ai` levels. Grading is deterministic on the files; running live is optional. */
export default function AiWorkspace({ level, hintsUsed, onPassed }: Props) {
  const { user } = useAuth();
  const fileKey = `${user?.id ?? 'guest'}:${level.id}:ai`;
  const { submit, passStats, results, status, clearResults, setStatus } = useLevelSubmission({ levelId: level.id, hintsUsed, onPassed });
  const [starter, setStarter] = useState<WorkspaceFiles>({});
  const [files, setFiles] = useState<WorkspaceFiles>({});
  const [activeFile, setActiveFile] = useState('');
  const [ready, setReady] = useState(false);
  const [userMessage, setUserMessage] = useState('');
  const [output, setOutput] = useState('');
  const [runError, setRunError] = useState('');
  const [running, setRunning] = useState(false);
  const [confirmReset, setConfirmReset] = useState(false);
  const [pricingProvider, setPricingProvider] = useState<string | null>(null);
  const filesRef = useRef(files);
  filesRef.current = files;

  useEffect(() => {
    let active = true;
    async function hydrate() {
      setReady(false);
      const initial: WorkspaceFiles = {};
      for (const file of level.starter_files ?? []) {
        initial[file.path] = file.content ?? await loadStarterFile(level.id, file.path, file.from).catch(() => '');
      }
      const saved = await loadWorkspaceFiles(fileKey, initial);
      if (!active) return;
      setStarter(initial);
      setFiles(saved);
      setActiveFile(Object.keys(saved).find((path) => path === 'prompt.json') ?? Object.keys(saved)[0] ?? '');
      setUserMessage(readPromptConfig(saved).config.sample_user ?? '');
      setReady(true);
    }
    void hydrate();
    void loadAiSettings().then((settings) => { if (active) setPricingProvider(settings?.providerId ?? null); });
    return () => { active = false; };
  }, [fileKey, level]);

  useEffect(() => {
    if (!ready) return;
    const timeout = window.setTimeout(() => { void saveWorkspaceFiles(fileKey, files); }, 400);
    return () => window.clearTimeout(timeout);
  }, [fileKey, files, ready]);

  const { config, error: configError } = useMemo(() => readPromptConfig(files), [files]);
  const estimate = useMemo(() => {
    const inputTokens = estimateRequestTokens({ system: config.system, messages: [{ role: 'user', content: userMessage }] });
    const outputTokens = typeof config.max_tokens === 'number' ? config.max_tokens : 512;
    const pricing = findPreset(pricingProvider ?? 'anthropic')?.pricing;
    return { ...estimateCost(inputTokens, outputTokens, pricing), provider: findPreset(pricingProvider ?? 'anthropic')?.label ?? 'Anthropic' };
  }, [config.max_tokens, config.system, pricingProvider, userMessage]);

  const editFile = (value: string) => {
    setFiles((previous) => ({ ...previous, [activeFile]: value }));
    clearResults();
  };

  const handleSubmit = useCallback(async () => {
    await saveWorkspaceFiles(fileKey, filesRef.current);
    await submit(gradeAiLevel(level.checks, filesRef.current));
  }, [fileKey, level.checks, submit]);

  const runLive = async () => {
    setRunError('');
    setOutput('');
    if (configError) { setRunError(configError); return; }
    const client = await getStreamingAiClient();
    if (!client) { setRunError('No AI key saved. Add one in Settings to run prompts live. You can still submit: grading does not need a key.'); return; }
    setRunning(true);
    try {
      await client.stream({
        system: config.system,
        messages: [{ role: 'user', content: userMessage || 'Hello' }],
        temperature: typeof config.temperature === 'number' ? config.temperature : undefined,
        maxTokens: typeof config.max_tokens === 'number' ? config.max_tokens : undefined,
        json: config.json === true,
      }, (delta) => setOutput((previous) => previous + delta));
    } catch (error) {
      setRunError(error instanceof AiError ? error.message : 'The request failed.');
    } finally {
      setRunning(false);
    }
  };

  const resetLevel = async () => {
    setFiles(starter);
    setActiveFile(Object.keys(starter).find((path) => path === 'prompt.json') ?? Object.keys(starter)[0] ?? '');
    await saveWorkspaceFiles(fileKey, starter);
    setOutput('');
    setRunError('');
    clearResults();
    setConfirmReset(false);
    setStatus('Level reset to the starter files.');
  };

  useSubmitShortcut(handleSubmit, true);
  if (!ready) return <div className={styles.loading} role="status">Loading prompt workspace…</div>;
  const fileNames = Object.keys(files);

  return (
    <section className={styles.workspace} aria-label="Prompt playground">
      <div className={styles.toolbar}>
        <strong>Prompt playground</strong>
        <div className={styles.toolbarActions}>
          {confirmReset ? (
            <span className={styles.confirm} role="group" aria-label="Confirm level reset">
              <span>Discard your edits?</span>
              <button type="button" className="btn btn-secondary" onClick={() => void resetLevel()}>Yes, reset</button>
              <button type="button" className="btn btn-ghost" onClick={() => setConfirmReset(false)}>Cancel</button>
            </span>
          ) : <button type="button" className="btn btn-ghost" onClick={() => setConfirmReset(true)}>Reset level</button>}
          <button type="button" className="btn btn-primary" {...submitButtonProps} onClick={() => void handleSubmit()}>Submit</button>
        </div>
      </div>

      <div className={styles.body}>
        <div className={styles.editorPane}>
          <div className={styles.tabs} role="tablist" aria-label="Workspace files">
            {fileNames.map((name) => (
              <button key={name} type="button" role="tab" aria-selected={name === activeFile} className={name === activeFile ? styles.activeTab : styles.tab} onClick={() => setActiveFile(name)}>{name}</button>
            ))}
          </div>
          <textarea className={styles.editor} aria-label={`Edit ${activeFile}`} spellCheck={false} value={files[activeFile] ?? ''} onChange={(event) => editFile(event.target.value)} />
          {configError && <p className={styles.warning} role="status">{configError}</p>}
        </div>

        <div className={styles.runPane}>
          <label htmlFor={`${level.id}-user`} className={styles.label}>User message (for a live test run)</label>
          <textarea id={`${level.id}-user`} className={styles.userBox} value={userMessage} onChange={(event) => setUserMessage(event.target.value)} rows={4} />
          <dl className={styles.estimate} aria-label="Token and cost estimate">
            <div><dt>Input</dt><dd>~{estimate.inputTokens} tokens</dd></div>
            <div><dt>Max output</dt><dd>{estimate.outputTokens} tokens</dd></div>
            <div><dt>Temperature</dt><dd>{config.temperature ?? 'default'}</dd></div>
            <div><dt>Worst-case cost</dt><dd>{formatUsd(estimate.usd)} · {formatInr(estimate.inr)}</dd></div>
            <div><dt>Per 10,000 calls</dt><dd>{formatUsd(estimate.usd * 10_000)} · {formatInr(estimate.inr * 10_000)}</dd></div>
          </dl>
          <p className={styles.hint}>Estimate uses ~4 characters per token and {estimate.provider} prices. Grading checks your files only and never needs a key.</p>
          <button type="button" className="btn btn-secondary" onClick={() => void runLive()} disabled={running}>{running ? 'Running…' : 'Run with my key'}</button>
          {runError && <p className={styles.error} role="alert">{runError} {runError.startsWith('No AI key') && <Link to="/settings">Open Settings</Link>}</p>}
          <div className={styles.label} id={`${level.id}-response`}>Response</div>
          <pre className={styles.response} aria-labelledby={`${level.id}-response`} aria-live="polite">{output || (running ? '' : 'Run the prompt to see the model reply here.')}</pre>
        </div>
      </div>
      <CheckResultsPanel results={results} status={status} stats={passStats} />
    </section>
  );
}
