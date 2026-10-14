import styles from './LearnPage.module.css';

export default function LearnPage() {
  return (
    <div className={styles.page}>
      <h1 className={styles.heading}>Learn</h1>
      <p className={styles.subtitle}>
        Your curriculum map will appear here. Content system is built in Milestone M2.
      </p>
      <div className={styles.placeholder}>
        <span className={styles.icon}>📚</span>
        <p>Phase 0 → Week 1 → Python Basics → Level 1: "Say my name"</p>
        <p className={styles.hint}>Coming soon — this is where you'll browse all 24 weeks of levels.</p>
      </div>
    </div>
  );
}
