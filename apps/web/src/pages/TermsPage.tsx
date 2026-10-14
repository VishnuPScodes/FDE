import styles from './LegalPage.module.css';

export default function TermsPage() {
  return (
    <div className={styles.page}>
      <div className={styles.container}>
        <a href="/" className={styles.backLink}>← Back to home</a>
        <h1>Terms of Use</h1>
        <p className={styles.lastUpdated}>Last updated: October 2026</p>

        <section>
          <h2>What this platform is</h2>
          <p>
            FDE Learning Platform is a free, self-paced educational website that teaches software
            engineering and Forward Deployed Engineer skills. It is not a certification body,
            university, or employment agency.
          </p>
        </section>

        <section>
          <h2>Your account</h2>
          <p>
            You sign in with your Google account. You are responsible for keeping your Google
            account secure. One person, one account. Do not share your account.
          </p>
        </section>

        <section>
          <h2>Content and code</h2>
          <p>
            The lessons, levels, and exercises on this platform are for your personal learning.
            You may not scrape, redistribute, or sell the platform's content.
          </p>
          <p>
            Code you write in the platform is yours. We store code submissions (capped at 20 KB) to
            track your progress. You can delete them at any time.
          </p>
        </section>

        <section>
          <h2>AI features</h2>
          <p>
            AI exercises require your own API key from a third-party provider. You are responsible
            for complying with your provider's terms. Never input personal, customer, or
            confidential data into AI exercises.
          </p>
        </section>

        <section>
          <h2>Free tier and availability</h2>
          <p>
            The platform is provided free of charge, as-is, with no warranty of availability,
            completeness, or fitness for a particular purpose. We may change, pause, or shut down
            the platform at any time.
          </p>
        </section>

        <section>
          <h2>Real-world levels</h2>
          <p>
            Some levels ask you to use real tools on your own laptop or free online environments.
            You are responsible for any costs you incur (e.g. if you use a paid cloud service
            instead of a free alternative). We always point you to free options first.
          </p>
        </section>

        <section>
          <h2>Cheating</h2>
          <p>
            This is a learning platform, not an exam. We do not police cheating. If you look at
            the solution before trying, you're only cheating yourself. That said, don't disrupt
            the platform or abuse the API.
          </p>
        </section>

        <section>
          <h2>Governing law</h2>
          <p>
            These terms are governed by the laws of India. Any disputes shall be resolved in the
            courts of Bengaluru, Karnataka.
          </p>
        </section>

        <section>
          <h2>Contact</h2>
          <p>
            Questions? Email: <a href="mailto:support@fdeplatform.dev">support@fdeplatform.dev</a>
          </p>
        </section>
      </div>
    </div>
  );
}
