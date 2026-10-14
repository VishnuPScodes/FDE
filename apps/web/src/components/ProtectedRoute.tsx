import { Navigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import type { ReactNode } from 'react';

/**
 * Wraps routes that require authentication.
 * Redirects to /sign-in if not authenticated.
 * Redirects to /consent if user hasn't accepted consent.
 */
export default function ProtectedRoute({ children }: { children: ReactNode }) {
  const { user, loading, needsConsent } = useAuth();

  if (loading) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div
          style={{
            width: 32,
            height: 32,
            border: '3px solid var(--border-default)',
            borderTopColor: 'var(--color-brand-500)',
            borderRadius: '50%',
            animation: 'spin 0.8s linear infinite',
          }}
          aria-label="Loading"
        />
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/sign-in" replace />;
  }

  if (needsConsent) {
    return <Navigate to="/consent" replace />;
  }

  return <>{children}</>;
}
