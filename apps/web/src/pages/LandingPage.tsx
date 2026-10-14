import styles from './LandingPage.module.css';

const CURRICULUM_PHASES = [
  {
    phase: '0',
    title: 'Foundations',
    weeks: '1–2',
    icon: '⚡',
    color: '#5568f8',
    topics: ['Python for production', 'Git & shell', 'SQL & data modelling'],
    output: 'CLI data tool + SQL notebook',
  },
  {
    phase: '1',
    title: 'Backend & Integration',
    weeks: '3–6',
    icon: '🔌',
    color: '#a855f7',
    topics: ['REST APIs & FastAPI', 'OAuth, JWT, security', 'TypeScript & React', 'ETL & messy data'],
    output: 'Project A: enterprise integration service',
  },
  {
    phase: '2',
    title: 'Cloud & Deployment',
    weeks: '7–9',
    icon: '☁️',
    color: '#06b6d4',
    topics: ['Docker & CI/CD', 'AWS + Terraform + Kubernetes', 'Observability & security'],
    output: 'Project A deployed with full CI/CD pipeline',
  },
  {
    phase: '3',
    title: 'Applied AI Engineering',
    weeks: '10–15',
    icon: '🤖',
    color: '#22c55e',
    topics: ['LLM APIs & prompting', 'RAG & vector search', 'Evals & testing', 'Agents & MCP', 'LLMOps'],
    output: 'Project B: evaluated RAG + agent system',
  },
  {
    phase: '4',
    title: 'Customer Craft',
    weeks: '16–19',
    icon: '🤝',
    color: '#f59e0b',
    topics: ['Discovery & stakeholder mapping', 'Decomposition framework', 'Writing & scoping', 'Demos & adoption'],
    output: 'Discovery notes, design doc, exec memo',
  },
  {
    phase: '5',
    title: 'Capstone',
    weeks: '20–22',
    icon: '🚀',
    color: '#ef4444',
    topics: ['Real customer deployment', 'Measure & harden', 'Case study & handover'],
    output: 'Live system + case study with real user',
  },
  {
    phase: '6',
    title: 'Interview Loop',
    weeks: '23–24',
    icon: '🎯',
    color: '#ec4899',
    topics: ['Coding drills', 'Decomposition mocks', 'Customer simulation', 'Story bank'],
    output: 'Story bank + 10 mock interviews + applications',
  },
];

const PLATFORM_FEATURES = [
  {
    icon: '💻',
    title: 'Code in the browser',
    description:
      'Monaco Editor (same as VS Code) with Python, TypeScript, SQL, YAML — no install needed.',
  },
  {
    icon: '🐳',
    title: 'Simulated Docker & Kubernetes',
    description:
      'Real commands, real output, real errors. Learn docker build and kubectl deploy without touching a terminal.',
  },
  {
    icon: '☁️',
    title: 'Simulated AWS console',
    description:
      'Practise IAM, S3, EC2, RDS, Lambda — with a billing simulator that teaches cost awareness.',
  },
  {
    icon: '🤖',
    title: 'AI exercises (bring your own key)',
    description:
      'Use free AI API keys from Google AI Studio, Groq or OpenRouter. Your key never leaves your browser.',
  },
  {
    icon: '🔬',
    title: 'Auto-graded levels',
    description:
      'Submit your code, get instant pass/fail with exact diff. No waiting for a human to review.',
  },
  {
    icon: '📡',
    title: 'Real-world verification',
    description:
      'Optional levels let you run Docker, Kubernetes and deployments on your own laptop or free online environments.',
  },
];

export default function LandingPage() {
  return (
    <div className={styles.page}>
      {/* ── Header ── */}
      <header className={styles.header}>
        <div className={styles.headerInner}>
          <div className={styles.logo}>
            <span className={styles.logoMark}>FDE</span>
            <span className={styles.logoLabel}>Learning Platform</span>
          </div>
          <nav className={styles.nav} aria-label="Main navigation">
            <a href="#curriculum">Curriculum</a>
            <a href="#platform">Platform</a>
            <a href="#faq">FAQ</a>
          </nav>
          <div className={styles.headerActions}>
            <a href="/sign-in" className="btn btn-primary" id="cta-signin-header">
              Start learning — it's free
            </a>
          </div>
        </div>
      </header>

      {/* ── Hero ── */}
      <section className={styles.hero} aria-labelledby="hero-heading">
        <div className={styles.heroBg} aria-hidden="true">
          <div className={styles.heroBgOrb1} />
          <div className={styles.heroBgOrb2} />
          <div className={styles.heroBgGrid} />
        </div>
        <div className={styles.heroContent}>
          <div className={styles.heroBadge}>
            <span className="badge badge-brand">October 2026 Edition</span>
            <span className={styles.heroBadgeText}>Based on real FDE job postings</span>
          </div>
          <h1 id="hero-heading" className={styles.heroHeading}>
            Become a{' '}
            <span className={styles.heroHeadingGradient}>Forward Deployed Engineer</span>
            <br />
            — the right way.
          </h1>
          <p className={styles.heroSubtitle}>
            A 24-week, completely free, hands-on curriculum. No videos. No pausing to watch someone
            else code. You write code, run it, break it, and fix it — right here in the browser.
          </p>
          <div className={styles.heroStats}>
            <div className={styles.heroStat}>
              <span className={styles.heroStatValue}>24</span>
              <span className={styles.heroStatLabel}>weeks</span>
            </div>
            <div className={styles.heroStatDivider} aria-hidden="true" />
            <div className={styles.heroStat}>
              <span className={styles.heroStatValue}>400+</span>
              <span className={styles.heroStatLabel}>hands-on levels</span>
            </div>
            <div className={styles.heroStatDivider} aria-hidden="true" />
            <div className={styles.heroStat}>
              <span className={styles.heroStatValue}>₹0</span>
              <span className={styles.heroStatLabel}>forever free</span>
            </div>
          </div>
          <div className={styles.heroCtas}>
            <a href="/sign-in" className="btn btn-primary btn-lg" id="cta-signin-hero">
              Start for free →
            </a>
            <a href="#curriculum" className="btn btn-secondary btn-lg">
              See the curriculum
            </a>
          </div>
          <p className={styles.heroFineprint}>
            Sign in with Google. No email or password. No credit card. Ever.
          </p>
        </div>
      </section>

      {/* ── For whom ── */}
      <section className={styles.forWhom}>
        <div className="container">
          <div className={styles.forWhomGrid}>
            <div className={styles.forWhomCard}>
              <span className={styles.forWhomIcon}>👩‍💻</span>
              <h3>Working developers</h3>
              <p>
                You can write Python and build small apps, but you want to move into an AI or FDE
                role at a product company or AI lab.
              </p>
            </div>
            <div className={styles.forWhomCard}>
              <span className={styles.forWhomIcon}>🎓</span>
              <h3>Fresh graduates</h3>
              <p>
                Looking for a competitive edge? This curriculum mirrors what Palantir, Anthropic,
                Databricks and Indian AI startups actually test.
              </p>
            </div>
            <div className={styles.forWhomCard}>
              <span className={styles.forWhomIcon}>🏢</span>
              <h3>Solutions & implementation engineers</h3>
              <p>
                Already in a customer-facing technical role? Accelerate the jump to an FDE title with
                the AI depth and deployment skills employers are asking for in 2026.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* ── Curriculum ── */}
      <section id="curriculum" className={styles.curriculum} aria-labelledby="curriculum-heading">
        <div className="container">
          <div className={styles.sectionHeader}>
            <h2 id="curriculum-heading">The 24-week curriculum</h2>
            <p>
              Seven phases, from Python basics to a live capstone deployed for a real user. Each
              phase ends with a portfolio project that proves you can do the work.
            </p>
          </div>
          <div className={styles.phaseGrid}>
            {CURRICULUM_PHASES.map((phase) => (
              <div
                key={phase.phase}
                className={styles.phaseCard}
                style={{ '--phase-color': phase.color } as React.CSSProperties}
              >
                <div className={styles.phaseHeader}>
                  <span className={styles.phaseIcon}>{phase.icon}</span>
                  <div>
                    <div className={styles.phaseMeta}>
                      Phase {phase.phase} · Weeks {phase.weeks}
                    </div>
                    <h3 className={styles.phaseTitle}>{phase.title}</h3>
                  </div>
                </div>
                <ul className={styles.phaseTopics}>
                  {phase.topics.map((t) => (
                    <li key={t}>{t}</li>
                  ))}
                </ul>
                <div className={styles.phaseOutput}>
                  <span className={styles.phaseOutputLabel}>You'll build:</span>
                  <span>{phase.output}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Platform features ── */}
      <section id="platform" className={styles.features} aria-labelledby="features-heading">
        <div className="container">
          <div className={styles.sectionHeader}>
            <h2 id="features-heading">Everything you need, inside the platform</h2>
            <p>
              No switching to another tab. No installing tools. The terminal, editor, simulator and
              grader are all here.
            </p>
          </div>
          <div className={styles.featuresGrid}>
            {PLATFORM_FEATURES.map((f) => (
              <div key={f.title} className={`${styles.featureCard} card`}>
                <span className={styles.featureIcon}>{f.icon}</span>
                <h3 className={styles.featureTitle}>{f.title}</h3>
                <p className={styles.featureDesc}>{f.description}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── FAQ ── */}
      <section id="faq" className={styles.faq} aria-labelledby="faq-heading">
        <div className="container">
          <div className={styles.sectionHeader}>
            <h2 id="faq-heading">Common questions</h2>
          </div>
          <div className={styles.faqGrid}>
            <div className={styles.faqItem}>
              <h3>Is it really free?</h3>
              <p>
                Yes. No credit card, no subscription, no paid tiers. The platform is built on free
                infrastructure (Cloudflare, Supabase free tier) and runs most things in your
                browser. The only optional cost is an AI API key for AI exercises — but free keys
                from Google AI Studio and Groq are enough.
              </p>
            </div>
            <div className={styles.faqItem}>
              <h3>Do I need a powerful laptop?</h3>
              <p>
                A mid-range laptop (8 GB RAM) handles most levels. The Linux shell simulator is the
                heaviest component; it shows a download-progress bar the first time and caches
                after. Kubernetes levels need 16 GB RAM or a free online environment like GitHub
                Codespaces.
              </p>
            </div>
            <div className={styles.faqItem}>
              <h3>What if I already know some of this?</h3>
              <p>
                Each phase has "done when" checks. Pass them all? Skip ahead. The curriculum is
                designed to be fast for people who already know the basics in a given area.
              </p>
            </div>
            <div className={styles.faqItem}>
              <h3>How long does it take?</h3>
              <p>
                The curriculum targets 15–20 hours a week for 24 weeks (~400 hours total). At 10
                hours a week, expect 36–40 weeks. At 30 hours a week (full-time sprint), you could
                finish in 14–16 weeks.
              </p>
            </div>
            <div className={styles.faqItem}>
              <h3>Is this relevant for Indian FDE roles?</h3>
              <p>
                Yes. Examples use Indian context — GST workflows, Tally integrations, WhatsApp order
                logs, the DPDP Act, Bengaluru fintech companies. The curriculum is based on FDE
                postings reviewed in September 2026, including Indian AI startup and IT services
                openings.
              </p>
            </div>
            <div className={styles.faqItem}>
              <h3>What data do you collect?</h3>
              <p>
                We collect your Google profile (name, email, avatar) and login device data (browser,
                OS, IP, location). All of it is shown to you on your profile page. You can export or
                delete your account at any time. No ads, no third-party trackers, no selling data.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* ── Final CTA ── */}
      <section className={styles.finalCta} aria-labelledby="final-cta-heading">
        <div className="container">
          <div className={styles.finalCtaInner}>
            <h2 id="final-cta-heading">The proof that counts is something deployed.</h2>
            <p>
              Start today. Build the first level in under 5 minutes. Close the tab and come back
              tomorrow — your progress will be here.
            </p>
            <a href="/sign-in" className="btn btn-primary btn-lg" id="cta-signin-footer">
              Start learning for free →
            </a>
          </div>
        </div>
      </section>

      {/* ── Footer ── */}
      <footer className={styles.footer}>
        <div className="container">
          <div className={styles.footerInner}>
            <div className={styles.footerLogo}>
              <span className={styles.logoMark}>FDE</span>
              <span className={styles.logoLabel}>Learning Platform</span>
            </div>
            <nav className={styles.footerNav} aria-label="Footer navigation">
              <a href="/privacy">Privacy notice</a>
              <a href="/terms">Terms of use</a>
              <a href="mailto:support@fdeplatform.dev">Contact</a>
            </nav>
            <p className={styles.footerCopy}>© 2026 FDE Platform. Built in India.</p>
          </div>
        </div>
      </footer>
    </div>
  );
}
