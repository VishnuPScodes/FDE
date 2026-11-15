import { useEffect, useId, useState } from 'react';
import { AiError, createAiClient } from '../lib/ai/client';
import { AI_PROVIDER_PRESETS, PRESETS_LAST_VERIFIED, findPreset } from '../lib/ai/providers';
import { clearAiSettings, loadAiSettings, saveAiSettings, type AiSettings } from '../lib/ai/settings-store';
import styles from './AiKeySettings.module.css';

type Status = { tone: 'info' | 'success' | 'error'; text: string } | null;

function defaultsFor(providerId: string, apiKey = ''): AiSettings {
  const preset = findPreset(providerId) ?? AI_PROVIDER_PRESETS[0]!;
  return { providerId: preset.id, baseUrl: preset.baseUrl, model: preset.defaultModel, apiKey };
}

/** Bring-your-own-key settings. The key never leaves this browser except to the chosen provider. */
export default function AiKeySettings() {
  const id = useId();
  const [settings, setSettings] = useState<AiSettings>(() => defaultsFor('groq'));
  const [hasSaved, setHasSaved] = useState(false);
  const [showKey, setShowKey] = useState(false);
  const [busy, setBusy] = useState(false);
  const [confirmForget, setConfirmForget] = useState(false);
  const [status, setStatus] = useState<Status>(null);

  useEffect(() => {
    let active = true;
    void loadAiSettings().then((stored) => {
      if (!active || !stored) return;
      setSettings(stored);
      setHasSaved(true);
    });
    return () => { active = false; };
  }, []);

  const preset = findPreset(settings.providerId);
  const update = (patch: Partial<AiSettings>) => {
    setSettings((previous) => ({ ...previous, ...patch }));
    setStatus(null);
  };

  const changeProvider = (providerId: string) => {
    setSettings((previous) => defaultsFor(providerId, previous.apiKey));
    setStatus({ tone: 'info', text: 'Provider changed. Paste the key for this provider, then save.' });
  };

  const save = async () => {
    setBusy(true);
    try {
      await saveAiSettings(settings);
      setHasSaved(true);
      setStatus({ tone: 'success', text: 'Saved in this browser only.' });
    } catch {
      setStatus({ tone: 'error', text: 'Could not save settings in this browser. Check that site storage is allowed.' });
    } finally {
      setBusy(false);
    }
  };

  const testConnection = async () => {
    setBusy(true);
    setStatus({ tone: 'info', text: 'Testing connection…' });
    try {
      const reply = await createAiClient(settings).test();
      setStatus({ tone: 'success', text: `Connected. The model replied: “${reply.trim().slice(0, 60) || '(empty)'}”` });
    } catch (error) {
      setStatus({ tone: 'error', text: error instanceof AiError ? error.message : 'The test failed for an unknown reason.' });
    } finally {
      setBusy(false);
    }
  };

  const forget = async () => {
    await clearAiSettings();
    setSettings(defaultsFor(settings.providerId));
    setHasSaved(false);
    setConfirmForget(false);
    setStatus({ tone: 'success', text: 'Key and AI settings removed from this browser.' });
  };

  return (
    <section className={styles.panel} aria-labelledby={`${id}-title`}>
      <h2 id={`${id}-title`} className={styles.title}>AI provider (bring your own key)</h2>
      <p className={styles.privacy}>
        Your key stays in this browser. It is stored on this device only and is sent straight to the provider you choose, never to our servers.
        Free tiers may log or train on prompts, so never paste personal or customer data into AI exercises.
      </p>

      <div className={styles.grid}>
        <label className={styles.field} htmlFor={`${id}-provider`}>
          <span>Provider</span>
          <select id={`${id}-provider`} className="input" value={settings.providerId} onChange={(event) => changeProvider(event.target.value)}>
            {AI_PROVIDER_PRESETS.map((option) => <option key={option.id} value={option.id}>{option.label}</option>)}
          </select>
        </label>
        <label className={styles.field} htmlFor={`${id}-model`}>
          <span>Model</span>
          <input id={`${id}-model`} className="input" value={settings.model} onChange={(event) => update({ model: event.target.value })} autoComplete="off" spellCheck={false} placeholder="model id" />
        </label>
        <label className={`${styles.field} ${styles.wide}`} htmlFor={`${id}-base`}>
          <span>Base URL</span>
          <input id={`${id}-base`} className="input" type="url" value={settings.baseUrl} onChange={(event) => update({ baseUrl: event.target.value })} autoComplete="off" spellCheck={false} placeholder="https://…/v1" />
        </label>
        <div className={`${styles.field} ${styles.wide}`}>
          <label htmlFor={`${id}-key`}>API key{preset && !preset.needsKey ? ' (not needed)' : ''}</label>
          <div className={styles.keyRow}>
            <input id={`${id}-key`} className="input" type={showKey ? 'text' : 'password'} value={settings.apiKey} onChange={(event) => update({ apiKey: event.target.value })} autoComplete="off" spellCheck={false} placeholder={preset?.needsKey === false ? 'No key needed' : 'Paste your key'} />
            <button type="button" className="btn btn-ghost" onClick={() => setShowKey((value) => !value)} aria-pressed={showKey}>{showKey ? 'Hide' : 'Show'}</button>
          </div>
        </div>
      </div>

      {preset && (
        <p className={styles.note}>
          {preset.note}{' '}
          {preset.keyUrl && <a href={preset.keyUrl} target="_blank" rel="noreferrer noopener">Get a key</a>}
          <span className={styles.verified}> Presets last checked {PRESETS_LAST_VERIFIED}; limits change often.</span>
        </p>
      )}

      <div className={styles.actions}>
        <button type="button" className="btn btn-primary" onClick={() => void save()} disabled={busy}>Save</button>
        <button type="button" className="btn btn-secondary" onClick={() => void testConnection()} disabled={busy}>Test connection</button>
        {confirmForget ? (
          <span className={styles.confirm} role="group" aria-label="Confirm forgetting the key">
            <span>Remove the key from this browser?</span>
            <button type="button" className="btn btn-secondary" onClick={() => void forget()}>Yes, forget it</button>
            <button type="button" className="btn btn-ghost" onClick={() => setConfirmForget(false)}>Cancel</button>
          </span>
        ) : (
          <button type="button" className="btn btn-ghost" onClick={() => setConfirmForget(true)} disabled={!hasSaved && !settings.apiKey}>Forget key</button>
        )}
      </div>
      {status && <p className={`${styles.status} ${styles[status.tone]}`} role={status.tone === 'error' ? 'alert' : 'status'}>{status.text}</p>}
    </section>
  );
}
