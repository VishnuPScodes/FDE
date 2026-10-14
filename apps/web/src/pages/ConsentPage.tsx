import { useAuth } from '../contexts/AuthContext';
import { useState } from 'react';
import styles from './ConsentPage.module.css';

const CONSENT_VERSION = '1.0';

export default function ConsentPage() {
  const { acceptConsent, profile } = useAuth();
  const [submitting, setSubmitting] = useState(false);
  const [checked, setChecked] = useState(false);

  if (!profile) return null;

  const handleAccept = async () => {
    setSubmitting(true);
    await acceptConsent(CONSENT_VERSION);
    setSubmitting(false);
  };

  return (
    <div className={styles.page}>
      <div className={styles.card}>
        <span className={styles.logoMark}>FDE</span>
        <h1 className={styles.title}>Before you start</h1>
        <p className={styles.subtitle}>
          We need your consent to collect some data. Here's exactly what and why — no legalese.
        </p>

        <div className={styles.items}>
          <div className={styles.item}>
            <span className={styles.itemIcon}>👤</span>
            <div>
              <strong>Google profile</strong>
              <p>Name, email, and profile picture from Google. Used to identify your account.</p>
            </div>
          </div>
          <div className={styles.item}>
            <span className={styles.itemIcon}>💻</span>
            <div>
              <strong>Device & login data</strong>
              <p>
                Browser, OS, device type, screen size, IP-based location (country/city). Shown on
                your profile so you can spot unauthorized logins.
              </p>
            </div>
          </div>
          <div className={styles.item}>
            <span className={styles.itemIcon}>📈</span>
            <div>
              <strong>Learning progress</strong>
              <p>
                Which levels you've completed, attempts, hints used, time spent, code snapshots
                (last 5 per level, max 20 KB each).
              </p>
            </div>
          </div>
        </div>

        <div className={styles.rights}>
          <h3>Your rights</h3>
          <ul>
            <li>View all your data on your <strong>Profile</strong> page</li>
            <li>Export everything as JSON from <strong>Settings</strong></li>
            <li>Delete your account and all data permanently from <strong>Settings</strong></li>
          </ul>
          <p>
            We never sell or share your data. No ads. No third-party trackers. Read our full{' '}
            <a href="/privacy" target="_blank">privacy notice</a>.
          </p>
        </div>

        <label className={styles.checkbox}>
          <input
            type="checkbox"
            checked={checked}
            onChange={(e) => setChecked(e.target.checked)}
            id="consent-checkbox"
          />
          <span>
            I understand what data is collected and agree to the{' '}
            <a href="/privacy" target="_blank">privacy notice</a> and{' '}
            <a href="/terms" target="_blank">terms of use</a>.
          </span>
        </label>

        <button
          className={`btn btn-primary ${styles.acceptBtn}`}
          onClick={handleAccept}
          disabled={!checked || submitting}
          id="consent-accept"
        >
          {submitting ? 'Saving…' : 'Continue to dashboard'}
        </button>
      </div>
    </div>
  );
}
