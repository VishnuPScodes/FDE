import { useAuth } from '../contexts/AuthContext';
import { useTheme } from '../contexts/ThemeContext';
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import styles from './SettingsPage.module.css';

const API_URL = import.meta.env.VITE_API_URL as string || '';

export default function SettingsPage() {
  const { profile, session, signOut } = useAuth();
  const { theme, setTheme } = useTheme();
  const navigate = useNavigate();
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const handleExport = async () => {
    if (!session?.access_token || !API_URL) return;
    setExporting(true);
    try {
      const res = await fetch(`${API_URL}/me/export`, {
        headers: { Authorization: `Bearer ${session.access_token}` },
      });
      const data = await res.json();
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `fde-data-export-${new Date().toISOString().slice(0, 10)}.json`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error('Export failed:', err);
    }
    setExporting(false);
  };

  const handleDelete = async () => {
    if (!session?.access_token || !API_URL) return;
    setDeleting(true);
    try {
      await fetch(`${API_URL}/me`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${session.access_token}` },
      });
      await signOut();
      navigate('/');
    } catch (err) {
      console.error('Delete failed:', err);
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
        <h2 className={styles.sectionTitle}>AI provider</h2>
        <p className={styles.sectionDesc}>
          AI features use your own API key. It is stored only in your browser — never sent to our
          servers.
        </p>
        <div className={styles.aiPlaceholder}>
          <span className={styles.aiIcon}>🤖</span>
          <span>AI key settings will be added in a later milestone (M15).</span>
        </div>
      </section>

      {/* Data & Privacy */}
      <section className={styles.section}>
        <h2 className={styles.sectionTitle}>Data & privacy</h2>
        <p className={styles.sectionDesc}>
          We collect your Google profile, login device data, and learning progress. You can view,
          export, or delete everything at any time. We never sell or share your data.
        </p>
        <div className={styles.dataActions}>
          <button
            className="btn btn-secondary"
            onClick={handleExport}
            disabled={exporting}
            id="export-data"
          >
            {exporting ? 'Exporting…' : '📦 Export my data (JSON)'}
          </button>
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
                  onClick={handleDelete}
                  disabled={deleting}
                  id="delete-account-confirm"
                >
                  {deleting ? 'Deleting…' : 'Yes, delete everything'}
                </button>
              </div>
            </div>
          )}
        </div>
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
