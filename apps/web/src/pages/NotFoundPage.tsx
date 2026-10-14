import styles from './NotFoundPage.module.css';

export default function NotFoundPage() {
  return (
    <div className={styles.page}>
      <div className={styles.content}>
        <span className={styles.code}>404</span>
        <h1>Page not found</h1>
        <p>
          That URL doesn't exist. Try going back to the{' '}
          <a href="/" id="back-home-link">
            home page
          </a>
          .
        </p>
      </div>
    </div>
  );
}
