import { lazy, Suspense } from 'react';
import { BrowserRouter, Route, Routes } from 'react-router-dom';
import { AuthProvider } from './contexts/AuthContext';
import { ThemeProvider } from './contexts/ThemeContext';

// Layouts
import AppLayout from './layouts/AppLayout';

// Public pages
import LandingPage from './pages/LandingPage';
const SignInPage = lazy(() => import('./pages/SignInPage'));
const ResetPasswordPage = lazy(() => import('./pages/ResetPasswordPage'));
const PrivacyPage = lazy(() => import('./pages/PrivacyPage'));
const TermsPage = lazy(() => import('./pages/TermsPage'));
const ConsentPage = lazy(() => import('./pages/ConsentPage'));
const NotFoundPage = lazy(() => import('./pages/NotFoundPage'));

// Protected pages
const DashboardPage = lazy(() => import('./pages/DashboardPage'));
const LearnPage = lazy(() => import('./pages/LearnPage'));
const LevelPage = lazy(() => import('./pages/LevelPage'));
const ProfilePage = lazy(() => import('./pages/ProfilePage'));
const SettingsPage = lazy(() => import('./pages/SettingsPage'));
const AdminPage = lazy(() => import('./pages/AdminPage'));

// Guards
import ProtectedRoute from './components/ProtectedRoute';

export default function App() {
  return (
    <BrowserRouter>
      <ThemeProvider>
        <AuthProvider>
          <Suspense fallback={null}>
          <Routes>
            {/* ── Public routes ── */}
            <Route path="/" element={<LandingPage />} />
            <Route path="/sign-in" element={<SignInPage />} />
            <Route path="/reset-password" element={<ResetPasswordPage />} />
            <Route path="/privacy" element={<PrivacyPage />} />
            <Route path="/terms" element={<TermsPage />} />
            <Route path="/consent" element={<ConsentPage />} />

            {/* ── Protected routes (inside AppLayout) ── */}
            <Route
              element={
                <ProtectedRoute>
                  <AppLayout />
                </ProtectedRoute>
              }
            >
              <Route path="/dashboard" element={<DashboardPage />} />
              <Route path="/learn" element={<LearnPage />} />
              <Route path="/learn/module/:moduleId" element={<LearnPage />} />
              <Route path="/level/:levelId" element={<LevelPage />} />
              <Route path="/profile" element={<ProfilePage />} />
              <Route path="/settings" element={<SettingsPage />} />
              <Route path="/admin" element={<AdminPage />} />
            </Route>

            {/* ── 404 ── */}
            <Route path="*" element={<NotFoundPage />} />
          </Routes>
          </Suspense>
        </AuthProvider>
      </ThemeProvider>
    </BrowserRouter>
  );
}
