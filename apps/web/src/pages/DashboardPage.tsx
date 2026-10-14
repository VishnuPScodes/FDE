import { useAuth } from '../contexts/AuthContext';
import styles from './DashboardPage.module.css';

export default function DashboardPage() {
  const { profile } = useAuth();

  const firstName = profile?.full_name?.split(' ')[0] ?? 'Learner';

  return (
    <div className={styles.page}>
      <div className={styles.header}>
        <h1 className={styles.greeting}>
          Welcome back, <span className={styles.name}>{firstName}</span>
        </h1>
        <p className={styles.subtitle}>
          Pick up where you left off, or start a new phase.
        </p>
      </div>

      {/* Phase Progress Cards */}
      <div className={styles.phasesGrid}>
        {PHASES.map((phase) => (
          <div key={phase.id} className={styles.phaseCard} style={{ '--phase-color': phase.color } as React.CSSProperties}>
            <div className={styles.phaseCardTop}>
              <span className={styles.phaseEmoji}>{phase.icon}</span>
              <div>
                <span className={styles.phaseLabel}>Phase {phase.id}</span>
                <h3 className={styles.phaseTitle}>{phase.title}</h3>
              </div>
            </div>
            <div className={styles.progressBar}>
              <div
                className={styles.progressFill}
                style={{ width: `${phase.progress}%` }}
              />
            </div>
            <div className={styles.phaseCardBottom}>
              <span className={styles.progressText}>{phase.progress}% complete</span>
              <span className={styles.weekRange}>Weeks {phase.weeks}</span>
            </div>
          </div>
        ))}
      </div>

      {/* Stats Row */}
      <div className={styles.statsRow}>
        <div className={styles.statCard}>
          <span className={styles.statValue}>0</span>
          <span className={styles.statLabel}>Levels completed</span>
        </div>
        <div className={styles.statCard}>
          <span className={styles.statValue}>0h</span>
          <span className={styles.statLabel}>Time spent</span>
        </div>
        <div className={styles.statCard}>
          <span className={styles.statValue}>0</span>
          <span className={styles.statLabel}>Day streak</span>
        </div>
        <div className={styles.statCard}>
          <span className={styles.statValue}>—</span>
          <span className={styles.statLabel}>Next level</span>
        </div>
      </div>
    </div>
  );
}

const PHASES = [
  { id: 0, title: 'Foundations', weeks: '1–2', icon: '⚡', color: '#5568f8', progress: 0 },
  { id: 1, title: 'Backend & Integration', weeks: '3–6', icon: '🔌', color: '#a855f7', progress: 0 },
  { id: 2, title: 'Cloud & Deployment', weeks: '7–9', icon: '☁️', color: '#06b6d4', progress: 0 },
  { id: 3, title: 'Applied AI', weeks: '10–15', icon: '🤖', color: '#22c55e', progress: 0 },
  { id: 4, title: 'Customer Craft', weeks: '16–19', icon: '🤝', color: '#f59e0b', progress: 0 },
  { id: 5, title: 'Capstone', weeks: '20–22', icon: '🚀', color: '#ef4444', progress: 0 },
  { id: 6, title: 'Interview Loop', weeks: '23–24', icon: '🎯', color: '#ec4899', progress: 0 },
];
