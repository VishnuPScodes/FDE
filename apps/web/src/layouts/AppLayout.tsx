import { Outlet, NavLink, useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { useTheme } from '../contexts/ThemeContext';
import styles from './AppLayout.module.css';

export default function AppLayout() {
  const { profile, signOut } = useAuth();
  const { theme, toggleTheme } = useTheme();
  const navigate = useNavigate();

  const handleSignOut = async () => {
    await signOut();
    navigate('/');
  };

  return (
    <div className={styles.layout}>
      {/* ── Header ── */}
      <header className={styles.header} id="app-header">
        <div className={styles.headerLeft}>
          <NavLink to="/dashboard" className={styles.logo}>
            <span className={styles.logoMark}>FDE</span>
          </NavLink>
        </div>
        <div className={styles.headerRight}>
          <button
            className={styles.themeToggle}
            onClick={toggleTheme}
            aria-label={`Switch to ${theme === 'dark' ? 'light' : 'dark'} mode`}
            id="theme-toggle"
          >
            {theme === 'dark' ? '☀️' : '🌙'}
          </button>
          {profile && (
            <div className={styles.userMenu}>
              <NavLink to="/settings" className={styles.avatar} id="user-avatar">
                {profile.avatar_url ? (
                  <img
                    src={profile.avatar_url}
                    alt={profile.full_name}
                    className={styles.avatarImg}
                    referrerPolicy="no-referrer"
                  />
                ) : (
                  <span className={styles.avatarFallback}>
                    {profile.full_name.charAt(0).toUpperCase()}
                  </span>
                )}
              </NavLink>
            </div>
          )}
        </div>
      </header>

      {/* ── Sidebar ── */}
      <nav className={styles.sidebar} aria-label="Main navigation" id="app-sidebar">
        <div className={styles.sidebarLinks}>
          <NavLink
            to="/dashboard"
            className={({ isActive }) =>
              `${styles.sidebarLink} ${isActive ? styles.sidebarLinkActive : ''}`
            }
            id="nav-dashboard"
          >
            <span className={styles.sidebarIcon}>📊</span>
            <span>Dashboard</span>
          </NavLink>
          <NavLink
            to="/learn"
            className={({ isActive }) =>
              `${styles.sidebarLink} ${isActive ? styles.sidebarLinkActive : ''}`
            }
            id="nav-learn"
          >
            <span className={styles.sidebarIcon}>📚</span>
            <span>Learn</span>
          </NavLink>
          <NavLink
            to="/settings"
            className={({ isActive }) =>
              `${styles.sidebarLink} ${isActive ? styles.sidebarLinkActive : ''}`
            }
            id="nav-settings"
          >
            <span className={styles.sidebarIcon}>⚙️</span>
            <span>Settings</span>
          </NavLink>
          <NavLink
            to="/profile"
            className={({ isActive }) =>
              `${styles.sidebarLink} ${isActive ? styles.sidebarLinkActive : ''}`
            }
            id="nav-profile"
          >
            <span className={styles.sidebarIcon}>👤</span>
            <span>Profile</span>
          </NavLink>
        </div>
        <div className={styles.sidebarBottom}>
          <button className={styles.signOutBtn} onClick={handleSignOut} id="sign-out-btn">
            <span className={styles.sidebarIcon}>🚪</span>
            <span>Sign out</span>
          </button>
        </div>
      </nav>

      {/* ── Main Content ── */}
      <main className={styles.main} id="app-main">
        <Outlet />
      </main>
    </div>
  );
}
