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
}

interface AuthContextValue {
  user: User | null;
  session: Session | null;
  profile: UserProfile | null;
  loading: boolean;
  signInWithGoogle: () => Promise<void>;
  signOut: () => Promise<void>;
  refreshProfile: () => Promise<void>;
  needsConsent: boolean;
  acceptConsent: (version: string) => Promise<void>;
}

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
