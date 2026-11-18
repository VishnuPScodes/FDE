import { useState } from 'react';
import type { SyntheticEvent } from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth, AuthError } from '../contexts/AuthContext';
import { EMAIL_RE, MIN_PASSWORD_LENGTH } from '../lib/auth-rules';
import styles from './SignInPage.module.css';

type Mode = 'signin' | 'signup' | 'forgot' | 'check-email' | 'reset-sent';

export default function SignInPage() {
  const {
    user,
    loading,
    googleEnabled,
    signInWithGoogle,
    signInWithPassword,
    signUpWithPassword,
    resendConfirmation,
    verifyEmailCode,
    sendPasswordReset,
  } = useAuth();

  const [mode, setMode] = useState<Mode>('signin');
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [needsConfirm, setNeedsConfirm] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  if (loading) {
    return (
      <div className={styles.page}>
        <div className={styles.spinner} aria-label="Loading" />
      </div>
    );
  }

  if (user) {
    return <Navigate to="/dashboard" replace />;
  }

  const switchMode = (next: Mode) => {
    setMode(next);
    setError(null);
    setNotice(null);
    setNeedsConfirm(false);
    setPassword('');
    setConfirm('');
    setCode('');
  };

  const run = async (action: () => Promise<void>) => {
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      await action();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong. Please try again.');
      setNeedsConfirm(err instanceof AuthError && err.code === 'email_not_confirmed');
    } finally {
      setBusy(false);
    }
  };

  const validate = (): string | null => {
    if (!EMAIL_RE.test(email.trim())) return 'Enter a valid email address.';
    if (mode === 'forgot') return null;
    if (mode === 'signup') {
      if (!fullName.trim()) return 'Enter your name.';
      if (password.length < MIN_PASSWORD_LENGTH) return `Password must be at least ${MIN_PASSWORD_LENGTH} characters.`;
      if (password !== confirm) return 'Passwords do not match.';
    } else if (!password) {
      return 'Enter your password.';
    }
    return null;
  };

  const onSubmit = (e: SyntheticEvent<HTMLFormElement>) => {
    e.preventDefault();
    const problem = validate();
    if (problem) {
      setError(problem);
      return;
    }
    void run(async () => {
      if (mode === 'signin') {
        await signInWithPassword(email, password);
      } else if (mode === 'signup') {
        const result = await signUpWithPassword(email, password, fullName);
        if (result === 'confirm_email') setMode('check-email');
      } else if (mode === 'forgot') {
        await sendPasswordReset(email);
        setMode('reset-sent');
      }
    });
  };

  const onResend = () =>
    void run(async () => {
      await resendConfirmation(email);
      setNeedsConfirm(false);
      setCode('');
      setMode('check-email');
      setNotice('We sent you a new code. Check your inbox (and spam folder).');
    });

  const onVerify = (e: SyntheticEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!/^\d{6,10}$/.test(code.trim())) {
      setError('Enter the code from the email (numbers only).');
      return;
    }
    // On success Supabase signs the user in and the redirect above takes them to the dashboard.
    void run(() => verifyEmailCode(email, code));
  };

  const heading: Record<Mode, string> = {
    signin: 'Sign in to keep learning',
    signup: 'Create your account',
    forgot: 'Reset your password',
    'check-email': 'Check your email',
    'reset-sent': 'Check your email',
  };

  return (
    <div className={styles.page}>
      <div className={styles.card}>
        <div className={styles.cardHeader}>
          <span className={styles.logoMark}>FDE</span>
          <h1 className={styles.title}>{heading[mode]}</h1>
        </div>

        {mode === 'check-email' ? (
          <form className={styles.form} onSubmit={onVerify} noValidate>
            <p>
              We sent a verification code to <strong>{email}</strong>. Enter it below to activate your account.
            </p>
            <label className={styles.field}>
              <span>Verification code</span>
              <input
                type="text"
                inputMode="numeric"
                autoComplete="one-time-code"
                maxLength={10}
                value={code}
                onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
                autoFocus
              />
            </label>
            <p className={styles.hint}>Not there after a minute? Check your spam folder.</p>
            {notice && <p className={styles.notice}>{notice}</p>}
            {error && <p className={styles.error} role="alert">{error}</p>}
            <button type="submit" className={styles.primaryBtn} disabled={busy}>
              {busy ? 'Please wait…' : 'Verify and continue'}
            </button>
            <button type="button" className={styles.linkBtn} onClick={onResend} disabled={busy}>
              Send a new code
            </button>
            <button type="button" className={styles.linkBtn} onClick={() => switchMode('signin')}>
              Back to sign in
            </button>
          </form>
        ) : mode === 'reset-sent' ? (
          <div className={styles.sent} role="status">
            <p>
              If an account exists for <strong>{email}</strong>, we sent a link to set a new password.
            </p>
            <p className={styles.hint}>Not there after a minute? Check your spam folder.</p>
            {notice && <p className={styles.notice}>{notice}</p>}
            {error && <p className={styles.error} role="alert">{error}</p>}
            <button type="button" className={styles.primaryBtn} onClick={() => switchMode('signin')}>
              Back to sign in
            </button>
          </div>
        ) : (
          <>
            {mode !== 'forgot' && (
              <div className={styles.tabs} role="tablist">
                <button
                  type="button"
                  role="tab"
                  aria-selected={mode === 'signin'}
                  className={mode === 'signin' ? styles.tabActive : styles.tab}
                  onClick={() => switchMode('signin')}
                >
                  Sign in
                </button>
                <button
                  type="button"
                  role="tab"
                  aria-selected={mode === 'signup'}
                  className={mode === 'signup' ? styles.tabActive : styles.tab}
                  onClick={() => switchMode('signup')}
                >
                  Create account
                </button>
              </div>
            )}

            <form className={styles.form} onSubmit={onSubmit} noValidate>
              {mode === 'signup' && (
                <label className={styles.field}>
                  <span>Name</span>
                  <input
                    type="text"
                    autoComplete="name"
                    value={fullName}
                    onChange={(e) => setFullName(e.target.value)}
                    maxLength={100}
                  />
                </label>
              )}
              <label className={styles.field}>
                <span>Email</span>
                <input
                  type="email"
                  autoComplete="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                />
              </label>
              {mode !== 'forgot' && (
                <label className={styles.field}>
                  <span>Password</span>
                  <input
                    type="password"
                    autoComplete={mode === 'signup' ? 'new-password' : 'current-password'}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                  />
                </label>
              )}
              {mode === 'signup' && (
                <>
                  <label className={styles.field}>
                    <span>Confirm password</span>
                    <input
                      type="password"
                      autoComplete="new-password"
                      value={confirm}
                      onChange={(e) => setConfirm(e.target.value)}
                      aria-describedby="password-hint"
                    />
                  </label>
                  <small id="password-hint" className={styles.hint}>
                    At least {MIN_PASSWORD_LENGTH} characters.
                  </small>
                </>
              )}

              {error && <p className={styles.error} role="alert">{error}</p>}
              {notice && <p className={styles.notice}>{notice}</p>}
              {needsConfirm && (
                <button type="button" className={styles.linkBtn} onClick={onResend} disabled={busy}>
                  Email me a verification code
                </button>
              )}

              <button type="submit" className={styles.primaryBtn} disabled={busy}>
                {busy
                  ? 'Please wait…'
                  : mode === 'signin'
                    ? 'Sign in'
                    : mode === 'signup'
                      ? 'Create account'
                      : 'Send reset link'}
              </button>
            </form>

            {mode === 'signin' && (
              <button type="button" className={styles.linkBtn} onClick={() => switchMode('forgot')}>
                Forgot password?
              </button>
            )}
            {mode === 'forgot' && (
              <button type="button" className={styles.linkBtn} onClick={() => switchMode('signin')}>
                Back to sign in
              </button>
            )}

            {googleEnabled && mode !== 'forgot' && (
              <>
                <div className={styles.divider}><span>or</span></div>
                <button className={styles.googleBtn} onClick={() => void signInWithGoogle()} id="google-sign-in" type="button">
                  <svg viewBox="0 0 24 24" width="20" height="20" className={styles.googleIcon} aria-hidden="true">
                    <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 01-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" />
                    <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
                    <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
                    <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
                  </svg>
                  Continue with Google
                </button>
              </>
            )}
          </>
        )}

        <p className={styles.privacy}>
          By continuing, you agree to our{' '}
          <a href="/privacy" target="_blank">privacy notice</a> and{' '}
          <a href="/terms" target="_blank">terms of use</a>. We collect device and login data to improve the
          platform. You can view, export, or delete your data at any time.
        </p>
      </div>
    </div>
  );
}
