import { useState } from 'react';
import type { SyntheticEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { MIN_PASSWORD_LENGTH } from '../lib/auth-rules';
import styles from './SignInPage.module.css';

/**
 * Landing page for the password-reset email link. Supabase signs the user in with a
 * short-lived recovery session (PASSWORD_RECOVERY event); here they choose a new password.
 */
export default function ResetPasswordPage() {
  const { user, loading, updatePassword } = useAuth();
  const navigate = useNavigate();
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  if (loading) {
    return (
      <div className={styles.page}>
        <div className={styles.spinner} aria-label="Loading" />
      </div>
    );
  }

  if (!user) {
    return (
      <div className={styles.page}>
        <div className={styles.card}>
          <div className={styles.cardHeader}>
            <span className={styles.logoMark}>FDE</span>
            <h1 className={styles.title}>Link expired</h1>
          </div>
          <p className={styles.sent}>This reset link is invalid or has expired. Request a new one from the sign-in page.</p>
          <Link to="/sign-in" className={styles.linkBtn}>Back to sign in</Link>
        </div>
      </div>
    );
  }

  const onSubmit = (e: SyntheticEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (password.length < MIN_PASSWORD_LENGTH) {
      setError(`Password must be at least ${MIN_PASSWORD_LENGTH} characters.`);
      return;
    }
    if (password !== confirm) {
      setError('Passwords do not match.');
      return;
    }
    setBusy(true);
    setError(null);
    updatePassword(password)
      .then(() => navigate('/dashboard', { replace: true }))
      .catch((err: unknown) => setError(err instanceof Error ? err.message : 'Could not update your password.'))
      .finally(() => setBusy(false));
  };

  return (
    <div className={styles.page}>
      <div className={styles.card}>
        <div className={styles.cardHeader}>
          <span className={styles.logoMark}>FDE</span>
          <h1 className={styles.title}>Choose a new password</h1>
        </div>
        <form className={styles.form} onSubmit={onSubmit} noValidate>
          <label className={styles.field}>
            <span>New password</span>
            <input type="password" autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} />
          </label>
          <label className={styles.field}>
            <span>Confirm new password</span>
            <input
              type="password"
              autoComplete="new-password"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              aria-describedby="password-hint"
            />
          </label>
          <small id="password-hint" className={styles.hint}>At least {MIN_PASSWORD_LENGTH} characters.</small>
          {error && <p className={styles.error} role="alert">{error}</p>}
          <button type="submit" className={styles.primaryBtn} disabled={busy}>
            {busy ? 'Please wait…' : 'Update password'}
          </button>
        </form>
      </div>
    </div>
  );
}
