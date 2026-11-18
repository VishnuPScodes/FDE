import { useAuth } from '../contexts/AuthContext';
import { useTheme } from '../contexts/ThemeContext';
import { useRef, useState } from 'react';
import { getLocalProgress, importProgressRows, parseProgressImport, serializeProgressExport } from '../lib/progress';
import { useNavigate } from 'react-router-dom';
import AiKeySettings from '../components/AiKeySettings';
import styles from './SettingsPage.module.css';

const API_URL = import.meta.env.VITE_API_URL ?? '';

/** Remove learner data this browser holds (workspaces, progress mirror, AI key). */
async function clearLocalLearnerData(): Promise<void> {
  try {
    for (const key of Object.keys(localStorage)) {
      if (key.startsWith('fde-')) localStorage.removeItem(key);
    }
  } catch { /* storage blocked */ }
  for (const name of ['fde-learner-workspace', 'fde-ai-settings']) {
    try {
      await new Promise<void>((resolve) => {
        const request = indexedDB.deleteDatabase(name);
        request.onsuccess = () => resolve();
        request.onerror = () => resolve();
        request.onblocked = () => resolve();
      });
    } catch { /* IndexedDB unavailable */ }
  }
}

export default function SettingsPage() {
  const { profile, session, signOut } = useAuth();
  const { theme, setTheme } = useTheme();
  const navigate = useNavigate();
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [accountMessage, setAccountMessage] = useState('');

  const handleExport = async () => {
    setAccountMessage('');
    if (!session?.access_token || !API_URL) {
      setAccountMessage('Data export needs the platform API, which is not configured here.');
      return;
    }
    setExporting(true);
    try {
      const res = await fetch(`${API_URL}/me/export`, {
        headers: { Authorization: `Bearer ${session.access_token}` },
      });
      if (!res.ok) throw new Error(`Export failed (HTTP ${res.status}).`);
      const data: unknown = await res.json();
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `fde-data-export-${new Date().toISOString().slice(0, 10)}.json`;
      a.click();
      URL.revokeObjectURL(url);
      setAccountMessage('Your data export has downloaded.');
    } catch (err) {
      setAccountMessage(err instanceof Error ? `${err.message} Please try again.` : 'Export failed. Please try again.');
    } finally {
      setExporting(false);
    }
  };

  const importInput = useRef<HTMLInputElement>(null);

  const handleProgressExport = () => {
    const blob = new Blob([serializeProgressExport(getLocalProgress())], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `fde-progress-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
    setAccountMessage('Your progress file has downloaded.');
  };

  const handleProgressImport = async (file: File | undefined) => {
    if (!file) return;
    try {
      if (file.size > 5_000_000) { setAccountMessage('That file is too large to be a progress export.'); return; }
      const parsed = parseProgressImport(await file.text());
      if (!parsed.ok) { setAccountMessage(parsed.error); return; }
      const count = importProgressRows(parsed.rows);
      setAccountMessage(`Imported progress for ${count} level${count === 1 ? '' : 's'}${parsed.skipped ? ` (${parsed.skipped} invalid entries skipped)` : ''}. Reload to see it everywhere.`);
    } catch {
      setAccountMessage('Could not read that file.');
    } finally {
      if (importInput.current) importInput.current.value = '';
    }
  };

  const handleDelete = async () => {
    setAccountMessage('');
    if (!session?.access_token || !API_URL) {
      setAccountMessage('Account deletion needs the platform API, which is not configured here. Nothing was deleted.');
      return;
    }
    setDeleting(true);
    try {
      const res = await fetch(`${API_URL}/me`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${session.access_token}` },
      });
      // Only sign out once the server confirms deletion; otherwise the learner
      // would believe their data was erased when it was not.
      if (!res.ok) throw new Error(`Deletion failed (HTTP ${res.status}). Your account was not deleted.`);
      await clearLocalLearnerData();
      await signOut();
      void navigate('/');
    } catch (err) {
      setAccountMessage(err instanceof Error ? err.message : 'Deletion failed. Your account was not deleted.');
      setDeleting(false);
    }
  };

  if (!profile) return null;

  return (
    <div className={styles.page}>
      <h1 className={styles.heading}>Settings</h1>

      {/* Appearance */}
      <section className={styles.section}>
        <h2 className={styles.sectionTitle}>Appearance</h2>
        <div className={styles.themeOptions}>
          <button
            className={`${styles.themeBtn} ${theme === 'dark' ? styles.themeBtnActive : ''}`}
            onClick={() => setTheme('dark')}
            id="theme-dark"
          >
            <span className={styles.themeIcon}>🌙</span>
            <span>Dark</span>
          </button>
          <button
            className={`${styles.themeBtn} ${theme === 'light' ? styles.themeBtnActive : ''}`}
            onClick={() => setTheme('light')}
            id="theme-light"
          >
            <span className={styles.themeIcon}>☀️</span>
            <span>Light</span>
          </button>
        </div>
      </section>

      {/* AI Provider */}
      <section className={styles.section}>
        <AiKeySettings />
      </section>

      {/* Data & Privacy */}
      <section className={styles.section}>
        <h2 className={styles.sectionTitle}>Data & privacy</h2>
        <p className={styles.sectionDesc}>
          We collect your account details, login device data, and learning progress. You can view,
          export, or delete everything at any time. We never sell or share your data.
        </p>
        <div className={styles.dataActions}>
          <button
            className="btn btn-secondary"
            onClick={() => void handleExport()}
            disabled={exporting}
            id="export-data"
          >
            {exporting ? 'Exporting…' : '📦 Export my data (JSON)'}
          </button>
          <button className="btn btn-secondary" onClick={handleProgressExport} id="export-progress">
            💾 Export progress file
          </button>
          <button className="btn btn-secondary" onClick={() => importInput.current?.click()} id="import-progress">
            📥 Import progress file
          </button>
          <input
            ref={importInput}
            type="file"
            accept="application/json,.json"
            hidden
            aria-label="Import progress file"
            onChange={(event) => { void handleProgressImport(event.target.files?.[0]); }}
          />
          {!showDeleteConfirm ? (
            <button
              className={`btn ${styles.deleteBtn}`}
              onClick={() => setShowDeleteConfirm(true)}
              id="delete-account-start"
            >
              🗑️ Delete my account
            </button>
          ) : (
            <div className={styles.deleteConfirm}>
              <p className={styles.deleteWarning}>
                This will permanently delete your account and all associated data. This cannot be
                undone.
              </p>
              <div className={styles.deleteActions}>
                <button
                  className="btn btn-ghost"
                  onClick={() => setShowDeleteConfirm(false)}
                >
                  Cancel
                </button>
                <button
                  className={`btn ${styles.deleteBtnConfirm}`}
                  onClick={() => void handleDelete()}
                  disabled={deleting}
                  id="delete-account-confirm"
                >
                  {deleting ? 'Deleting…' : 'Yes, delete everything'}
                </button>
              </div>
            </div>
          )}
        </div>
        {accountMessage && <p role="status" className={styles.sectionDesc}>{accountMessage}</p>}
      </section>

      {/* Links */}
      <section className={styles.section}>
        <h2 className={styles.sectionTitle}>Legal</h2>
        <div className={styles.legalLinks}>
          <a href="/privacy" className={styles.legalLink}>Privacy notice</a>
          <a href="/terms" className={styles.legalLink}>Terms of use</a>
        </div>
      </section>
    </div>
  );
}
