import { BrowserRouter, Route, Routes } from 'react-router-dom';
import { AuthProvider } from './contexts/AuthContext';
import { ThemeProvider } from './contexts/ThemeContext';

// Layouts
import AppLayout from './layouts/AppLayout';

// Public pages
import LandingPage from './pages/LandingPage';
import SignInPage from './pages/SignInPage';
import PrivacyPage from './pages/PrivacyPage';
import TermsPage from './pages/TermsPage';
import ConsentPage from './pages/ConsentPage';
import NotFoundPage from './pages/NotFoundPage';

// Protected pages
import DashboardPage from './pages/DashboardPage';
import LearnPage from './pages/LearnPage';
import LevelPage from './pages/LevelPage';
import ProfilePage from './pages/ProfilePage';
import SettingsPage from './pages/SettingsPage';

// Guards
import ProtectedRoute from './components/ProtectedRoute';

export default function App() {
  return (
    <BrowserRouter>
      <ThemeProvider>
        <AuthProvider>
          <Routes>
            {/* ── Public routes ── */}
            <Route path="/" element={<LandingPage />} />
            <Route path="/sign-in" element={<SignInPage />} />
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
            </Route>

            {/* ── 404 ── */}
            <Route path="*" element={<NotFoundPage />} />
          </Routes>
        </AuthProvider>
      </ThemeProvider>
    </BrowserRouter>
  );
}
