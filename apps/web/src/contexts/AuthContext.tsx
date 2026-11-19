import { createContext, useContext, useEffect, useState, useCallback } from 'react';
import type { ReactNode } from 'react';
import type { User, Session } from '@supabase/supabase-js';
import { supabase } from '../lib/supabase';
import { collectDeviceInfo } from '../lib/device-info';
import { MOCK_AUTH_ENABLED, createMockSession } from '../lib/mock-auth';

const API_URL = import.meta.env.VITE_API_URL ?? '';
const MOCK_CONSENT_KEY = 'fde-mock-consent';

interface UserProfile {
  id: string;
  google_email: string;
  full_name: string;
  avatar_url: string | null;
  created_at: string;
  last_login_at: string;
  consent_version: string | null;
  consent_at: string | null;
  role: string;
  /** Admin-set override: every level is open for this user. */
  unlock_all_levels?: boolean;
}

interface AuthContextValue {
  user: User | null;
  session: Session | null;
  profile: UserProfile | null;
  loading: boolean;
  signInWithGoogle: () => Promise<void>;
  /** True once Supabase reports the Google provider as enabled; the button stays hidden until then. */
  googleEnabled: boolean;
  signUpWithPassword: (email: string, password: string, fullName: string) => Promise<SignUpResult>;
  signInWithPassword: (email: string, password: string) => Promise<void>;
  resendConfirmation: (email: string) => Promise<void>;
  /** Confirms a new account with the code from the sign-up email; signs the user in on success. */
  verifyEmailCode: (email: string, code: string) => Promise<void>;
  sendPasswordReset: (email: string) => Promise<void>;
  updatePassword: (newPassword: string) => Promise<void>;
  /** True after the user arrives from a password-reset email link (PASSWORD_RECOVERY event). */
  passwordRecovery: boolean;
  signOut: () => Promise<void>;
  refreshProfile: () => Promise<void>;
  needsConsent: boolean;
  acceptConsent: (version: string) => Promise<void>;
}

export type SignUpResult = 'confirm_email' | 'signed_in';

/** Error with a message safe to show in the UI. */
export class AuthError extends Error {
  constructor(
    message: string,
    readonly code: 'email_not_confirmed' | 'invalid_credentials' | 'weak_password' | 'rate_limited' | 'invalid_code' | 'other' = 'other',
  ) {
    super(message);
    this.name = 'AuthError';
  }
}

function toAuthError(err: { message?: string; code?: string; status?: number } | null | undefined): AuthError {
  const code = err?.code ?? '';
  const msg = err?.message ?? 'Something went wrong. Please try again.';
  if (code === 'email_not_confirmed' || /email not confirmed/i.test(msg)) {
    return new AuthError('Please confirm your email first with the code we emailed you.', 'email_not_confirmed');
  }
  if (code === 'invalid_credentials' || /invalid login credentials/i.test(msg)) {
    return new AuthError('Incorrect email or password.', 'invalid_credentials');
  }
  if (code === 'weak_password' || /password/i.test(msg) && /(weak|short|at least|characters)/i.test(msg)) {
    return new AuthError(msg, 'weak_password');
  }
  if (code === 'otp_expired' || /token has expired|otp.*(expired|invalid)|invalid.*(otp|token)/i.test(msg)) {
    return new AuthError('That code is wrong or has expired. Check it, or send a new code.', 'invalid_code');
  }
  if (err?.status === 429 || code.includes('rate_limit') || /rate limit/i.test(msg)) {
    return new AuthError('Too many attempts or emails sent. Please wait a few minutes and try again.', 'rate_limited');
  }
  return new AuthError(msg);
}

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL ?? '';
const SUPABASE_KEY = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY ?? import.meta.env.VITE_SUPABASE_ANON_KEY ?? '';

const AuthContext = createContext<AuthContextValue | null>(null);

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>');
  return ctx;
}

const CONSENT_VERSION = '1.0';

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [profileChecked, setProfileChecked] = useState(false);
  const [googleEnabled, setGoogleEnabled] = useState(false);
  const [passwordRecovery, setPasswordRecovery] = useState(false);

  // Show "Continue with Google" only when the provider is actually enabled in Supabase.
  useEffect(() => {
    if (MOCK_AUTH_ENABLED || !SUPABASE_URL || !SUPABASE_KEY) return;
    let cancelled = false;
    fetch(`${SUPABASE_URL}/auth/v1/settings`, { headers: { apikey: SUPABASE_KEY } })
      .then((r) => (r.ok ? (r.json() as Promise<{ external?: Record<string, boolean> }>) : null))
      .then((d) => {
        if (!cancelled) setGoogleEnabled(Boolean(d?.external?.google));
      })
      .catch(() => {
        /* offline or blocked: keep the Google button hidden */
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const fetchProfile = useCallback(async () => {
    try {
      const { data }: { data: unknown } = await supabase
        .from('profiles')
        .select('*')
        .single();
      if (data) setProfile(data as UserProfile);
    } finally {
      setProfileChecked(true);
    }
  }, []);

  const recordLoginEvent = useCallback(async (accessToken: string) => {
    if (!API_URL) return;
    try {
      const deviceInfo = collectDeviceInfo();
      await fetch(`${API_URL}/session/login-event`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify(deviceInfo),
      });
    } catch (err) {
      console.warn('Failed to record login event:', err);
    }
  }, []);

  // Initialize auth state
  useEffect(() => {
    let mounted = true;

    if (MOCK_AUTH_ENABLED) {
      const mock = createMockSession();
      setSession(mock);
      setUser(mock.user);
      setProfile({
        id: mock.user.id,
        google_email: mock.user.email ?? '',
        full_name: 'Test Learner',
        avatar_url: null,
        created_at: mock.user.created_at,
        last_login_at: new Date().toISOString(),
        consent_version: (() => { try { return localStorage.getItem(MOCK_CONSENT_KEY); } catch { return null; } })(),
        consent_at: null,
        role: 'admin', // dev-only mock: lets the admin page render sample data
      });
      setProfileChecked(true);
      setLoading(false);
      return () => { mounted = false; };
    }

    void supabase.auth.getSession().then(({ data: { session: s } }) => {
      if (!mounted) return;
      setSession(s);
      setUser(s?.user ?? null);
      if (s?.user) {
        void fetchProfile();
      } else {
        setProfileChecked(true);
      }
      setLoading(false);
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(async (_event, s) => {
      if (!mounted) return;
      if (_event === 'PASSWORD_RECOVERY') setPasswordRecovery(true);
      setSession(s);
      setUser(s?.user ?? null);
      if (s?.user) {
        await fetchProfile();
        // Record login event on sign-in or token refresh
        if (_event === 'SIGNED_IN' && s.access_token) {
          void recordLoginEvent(s.access_token);
          // Update last_login_at
          await supabase
            .from('profiles')
            .update({ last_login_at: new Date().toISOString() })
            .eq('id', s.user.id);
        }
      } else {
        setProfile(null);
      }
    });

    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, [fetchProfile, recordLoginEvent]);

  const signInWithGoogle = async () => {
    await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: `${window.location.origin}/dashboard`,
      },
    });
  };

  const authRedirect = (path: string) => `${window.location.origin}${path}`;

  const signUpWithPassword = async (email: string, password: string, fullName: string): Promise<SignUpResult> => {
    const { data, error } = await supabase.auth.signUp({
      email: email.trim(),
      password,
      options: {
        data: { full_name: fullName.trim() },
        emailRedirectTo: authRedirect('/dashboard'),
      },
    });
    if (error) throw toAuthError(error);
    // With "Confirm email" on, Supabase returns no session until the link is clicked.
    // (For an address that is already registered it also returns no session, on purpose,
    // so the UI shows the same "check your email" message and does not reveal accounts.)
    return data.session ? 'signed_in' : 'confirm_email';
  };

  const signInWithPassword = async (email: string, password: string) => {
    const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
    if (error) throw toAuthError(error);
  };

  const resendConfirmation = async (email: string) => {
    const { error } = await supabase.auth.resend({
      type: 'signup',
      email: email.trim(),
      options: { emailRedirectTo: authRedirect('/dashboard') },
    });
    if (error) throw toAuthError(error);
  };

  const verifyEmailCode = async (email: string, code: string) => {
    // type 'email' matches both sign-up confirmation codes and sign-in codes.
    const { error } = await supabase.auth.verifyOtp({ email: email.trim(), token: code.trim(), type: 'email' });
    if (error) throw toAuthError(error);
  };

  const sendPasswordReset = async (email: string) => {
    const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), {
      redirectTo: authRedirect('/reset-password'),
    });
    if (error) throw toAuthError(error);
  };

  const updatePassword = async (newPassword: string) => {
    const { error } = await supabase.auth.updateUser({ password: newPassword });
    if (error) throw toAuthError(error);
    setPasswordRecovery(false);
  };

  const signOut = async () => {
    if (MOCK_AUTH_ENABLED) {
      setUser(null);
      setSession(null);
      setProfile(null);
      return;
    }
    await supabase.auth.signOut();
    setProfile(null);
  };

  // Consent is required until a profile proves it was given. A missing profile
  // (e.g. a failed fetch) must not silently bypass the consent screen.
  const needsConsent = user !== null && profileChecked && profile?.consent_version !== CONSENT_VERSION;

  const acceptConsent = async (version: string) => {
    if (MOCK_AUTH_ENABLED) {
      try { localStorage.setItem(MOCK_CONSENT_KEY, version); } catch { /* storage blocked */ }
      setProfile((previous) => previous ? { ...previous, consent_version: version, consent_at: new Date().toISOString() } : previous);
      return;
    }
    if (!session?.access_token || !user) throw new Error('You need to be signed in to accept the privacy notice.');
    // Record consent through the API when it is configured (it also logs the
    // consent event); otherwise fall back to the RLS-protected profile row.
    if (API_URL) {
      const response = await fetch(`${API_URL}/consent`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({ version }),
      });
      if (!response.ok) throw new Error('Could not record your consent. Please try again.');
    }
    const { error } = await supabase
      .from('profiles')
      .update({ consent_version: version, consent_at: new Date().toISOString() })
      .eq('id', user.id);
    if (error) throw new Error('Could not record your consent. Please try again.');
    await fetchProfile();
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        session,
        profile,
        loading: loading || (user !== null && !profileChecked),
        signInWithGoogle,
        googleEnabled,
        signUpWithPassword,
        signInWithPassword,
        resendConfirmation,
        verifyEmailCode,
        sendPasswordReset,
        updatePassword,
        passwordRecovery,
        signOut,
        refreshProfile: fetchProfile,
        needsConsent,
        acceptConsent,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}
