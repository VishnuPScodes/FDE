import styles from './LegalPage.module.css';

export default function PrivacyPage() {
  return (
    <div className={styles.page}>
      <div className={styles.container}>
        <a href="/" className={styles.backLink}>← Back to home</a>
        <h1>Privacy Notice</h1>
        <p className={styles.lastUpdated}>Last updated: October 2026 · Version 1.0</p>

        <section>
          <h2>What we collect and why</h2>
          <p>
            When you sign in with Google, we receive your name, email address, and profile picture
            from Google. We use this to create your account and show your name in the platform.
          </p>
          <p>
            On every sign-in and session restore, we collect device and browser information: browser
            name and version, operating system, device type (desktop/tablet/mobile), screen size,
            language, timezone, and whether your device supports touch. Our server adds your IP
            address, country, city and region (from Cloudflare request headers).
          </p>
          <p>
            We collect this data to:
          </p>
          <ul>
            <li>Show you your own login history so you can spot unauthorized access</li>
            <li>Understand what devices and browsers our learners use so we can optimize the platform</li>
            <li>Debug issues when the platform doesn't work on a specific device</li>
          </ul>
          <p>
            We also store your learning progress (which levels you've completed, how many attempts,
            hints used, time spent) and code submissions (capped at 20 KB each, last 5 per level).
          </p>
        </section>

        <section>
          <h2>What we don't do</h2>
          <ul>
            <li>We never sell or share your data with third parties</li>
            <li>We have no advertising, no third-party trackers, no analytics scripts</li>
            <li>We never access your AI API key — it stays in your browser's IndexedDB</li>
            <li>We never store your Google password — authentication is handled entirely by Google</li>
          </ul>
        </section>

        <section>
          <h2>AI features</h2>
          <p>
            AI exercises use your own API key from providers like Google AI Studio, Groq, or
            OpenRouter. Your key is stored only in your browser (IndexedDB) and sent directly from
            your browser to the AI provider. It never passes through our servers.
          </p>
          <p>
            <strong>Warning:</strong> Free AI tiers may log or use your prompts for training.
            Never paste personal, customer, or confidential data into AI exercises.
          </p>
        </section>

        <section>
          <h2>Your rights</h2>
          <p>Under the India Digital Personal Data Protection Act 2023 and general good practice:</p>
          <ul>
            <li><strong>View:</strong> See all your data on your Profile page (login history, devices, progress)</li>
            <li><strong>Export:</strong> Download all your data as JSON from Settings → Export</li>
            <li><strong>Delete:</strong> Permanently delete your account and all data from Settings → Delete Account</li>
          </ul>
          <p>
            Deletion is immediate and irreversible. All your data, including progress, submissions,
            and login history, is permanently removed from our database.
          </p>
        </section>

        <section>
          <h2>Data storage</h2>
          <p>
            Your data is stored in a Supabase Postgres database (hosted on AWS in Singapore).
            The platform frontend and API are hosted on Cloudflare's global network. All connections
            use HTTPS.
          </p>
        </section>

        <section>
          <h2>Contact</h2>
          <p>
            For privacy questions or complaints, email:{' '}
            <a href="mailto:privacy@fdeplatform.dev">privacy@fdeplatform.dev</a>
          </p>
        </section>
      </div>
    </div>
  );
}
