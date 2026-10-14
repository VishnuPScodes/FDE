import { createContext, useContext, useEffect, useState, useCallback } from 'react';
import type { ReactNode } from 'react';
import type { User, Session } from '@supabase/supabase-js';
import { supabase } from '../lib/supabase';
import { collectDeviceInfo } from '../lib/device-info';

const API_URL = import.meta.env.VITE_API_URL as string || '';

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

  const fetchProfile = useCallback(async () => {
    const { data } = await supabase
      .from('profiles')
      .select('*')
      .single();
    if (data) setProfile(data as UserProfile);
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

    supabase.auth.getSession().then(({ data: { session: s } }) => {
      if (!mounted) return;
      setSession(s);
      setUser(s?.user ?? null);
      if (s?.user) {
        void fetchProfile();
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
        if (_event === 'SIGNED_IN' && s?.access_token) {
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
    await supabase.auth.signOut();
    setProfile(null);
  };

  const needsConsent = profile !== null && profile.consent_version !== CONSENT_VERSION;

  const acceptConsent = async (version: string) => {
    if (!session?.access_token || !API_URL) return;
    try {
      await fetch(`${API_URL}/consent`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({ version }),
      });
      // Update local profile
      await supabase
        .from('profiles')
        .update({ consent_version: version, consent_at: new Date().toISOString() })
        .eq('id', user?.id ?? '');
      await fetchProfile();
    } catch (err) {
      console.error('Failed to record consent:', err);
    }
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        session,
        profile,
        loading,
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
