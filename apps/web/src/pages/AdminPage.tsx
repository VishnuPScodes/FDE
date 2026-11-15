import { useEffect, useMemo, useState } from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { MOCK_AUTH_ENABLED } from '../lib/mock-auth';
import styles from './AdminPage.module.css';

const API_URL = import.meta.env.VITE_API_URL ?? '';

interface LevelRow {
  level_id: string;
  learners: number;
  passed: number;
  pass_rate: number;
  avg_attempts: number;
  avg_hints: number;
  drop_off: number;
  drop_off_rate: number;
}
interface Overview {
  users: {
    total: number;
    active_7d: number;
    active_30d: number;
    list: { id: string; email: string; name: string; role: string; created_at: string; last_login_at: string; levels_passed: number }[];
  };
  logins: { last_7d: number; last_30d: number; by_country: { name: string; count: number }[]; by_device: { name: string; count: number }[] };
  feedback: { average_rating: number | null; items: { id: string; level_id: string | null; rating: number | null; message: string; created_at: string }[] };
}

const SAMPLE_OVERVIEW: Overview = {
  users: {
    total: 3, active_7d: 2, active_30d: 3,
    list: [
      { id: '1', email: 'learner@example.test', name: 'Test Learner', role: 'admin', created_at: '2026-10-01T00:00:00Z', last_login_at: '2026-11-10T00:00:00Z', levels_passed: 12 },
      { id: '2', email: 'sample@example.test', name: 'Sample Person', role: 'learner', created_at: '2026-10-15T00:00:00Z', last_login_at: '2026-11-05T00:00:00Z', levels_passed: 4 },
    ],
  },
  logins: { last_7d: 6, last_30d: 20, by_country: [{ name: 'IN', count: 18 }], by_device: [{ name: 'desktop', count: 15 }, { name: 'mobile', count: 5 }] },
  feedback: { average_rating: 4.5, items: [{ id: 'f1', level_id: 'p0-w01-py-001', rating: 5, message: 'Sample feedback', created_at: '2026-11-09T00:00:00Z' }] },
};
const SAMPLE_LEVELS: LevelRow[] = [
  { level_id: 'p0-w01-py-001', learners: 10, passed: 9, pass_rate: 0.9, avg_attempts: 1.8, avg_hints: 0.4, drop_off: 1, drop_off_rate: 0.1 },
  { level_id: 'p0-w01-py-002', learners: 8, passed: 4, pass_rate: 0.5, avg_attempts: 4.2, avg_hints: 2.1, drop_off: 4, drop_off_rate: 0.5 },
];

type SortKey = keyof LevelRow;
const COLUMNS: { key: SortKey; label: string; fmt?: (v: number) => string }[] = [
  { key: 'level_id', label: 'Level' },
  { key: 'learners', label: 'Attempted' },
  { key: 'passed', label: 'Passed' },
  { key: 'pass_rate', label: 'Pass rate', fmt: (v) => `${String(Math.round(v * 100))}%` },
  { key: 'avg_attempts', label: 'Avg attempts' },
  { key: 'avg_hints', label: 'Avg hints' },
  { key: 'drop_off', label: 'Drop-off' },
  { key: 'drop_off_rate', label: 'Drop-off %', fmt: (v) => `${String(Math.round(v * 100))}%` },
];

const day = (iso: string) => (iso ? iso.slice(0, 10) : '-');

export default function AdminPage() {
  const { profile, session } = useAuth();
  const isAdmin = profile?.role === 'admin';
  const [overview, setOverview] = useState<Overview | null>(MOCK_AUTH_ENABLED ? SAMPLE_OVERVIEW : null);
  const [levels, setLevels] = useState<LevelRow[]>(MOCK_AUTH_ENABLED ? SAMPLE_LEVELS : []);
  const [error, setError] = useState('');
  const [sort, setSort] = useState<{ key: SortKey; dir: 1 | -1 }>({ key: 'drop_off', dir: -1 });

  const token = session?.access_token;
  useEffect(() => {
    if (MOCK_AUTH_ENABLED || !isAdmin) return;
    if (!API_URL || !token) {
      setError('The platform API is not configured, so admin data is unavailable.');
      return;
    }
    const headers = { Authorization: `Bearer ${token}` };
    let cancelled = false;
    void Promise.all([
      fetch(`${API_URL}/admin/overview`, { headers }),
      fetch(`${API_URL}/admin/analytics`, { headers }),
    ])
      .then(async ([o, a]) => {
        if (!o.ok || !a.ok) throw new Error(`HTTP ${String(o.ok ? a.status : o.status)}`);
        const ov = (await o.json()) as Overview;
        const an = (await a.json()) as { levels: LevelRow[] };
        if (!cancelled) {
          setOverview(ov);
          setLevels(an.levels);
        }
      })
      .catch((err: unknown) => {
        if (!cancelled) setError(`Could not load admin data (${err instanceof Error ? err.message : 'error'}).`);
      });
    return () => { cancelled = true; };
  }, [isAdmin, token]);

  const sorted = useMemo(() => {
    const { key, dir } = sort;
    return [...levels].sort((a, b) => {
      const x = a[key];
      const y = b[key];
      return (typeof x === 'string' && typeof y === 'string' ? x.localeCompare(y) : Number(x) - Number(y)) * dir;
    });
  }, [levels, sort]);

  if (!isAdmin) return <Navigate to="/dashboard" replace />;

  const toggleSort = (key: SortKey) =>
    setSort((s) => (s.key === key ? { key, dir: s.dir === 1 ? -1 : 1 } : { key, dir: key === 'level_id' ? 1 : -1 }));

  return (
    <div className={styles.page} id="admin-page">
      <h1 className={styles.heading}>Admin</h1>
      <p className={styles.sub}>Computed from our own database. No third-party trackers.</p>
      {MOCK_AUTH_ENABLED && <p className={styles.notice}>Mock auth: showing sample data.</p>}
      {error && <p className={`${styles.notice} ${styles.error}`} role="alert">{error}</p>}
      {!overview && !error && <p className={styles.notice}>Loading...</p>}

      {overview && (
        <>
          <div className={styles.stats}>
            {[
              ['Users', overview.users.total],
              ['Active 7d', overview.users.active_7d],
              ['Active 30d', overview.users.active_30d],
              ['Logins 7d', overview.logins.last_7d],
              ['Logins 30d', overview.logins.last_30d],
              ['Avg rating', overview.feedback.average_rating ?? '-'],
            ].map(([label, value]) => (
              <div key={label} className={styles.stat}>
                <div className={styles.statValue}>{value}</div>
                <div className={styles.statLabel}>{label}</div>
              </div>
            ))}
          </div>

          <section className={styles.section}>
            <h2 className={styles.sectionTitle}>Content quality per level</h2>
            <p className={styles.sectionDesc}>Drop-off = learners who attempted a level but have not passed it. Click a header to sort.</p>
            <div className={styles.tableWrap}>
              <table className={styles.table}>
                <thead>
                  <tr>
                    {COLUMNS.map((col) => (
                      <th key={col.key} className={col.key === 'level_id' ? undefined : styles.num} aria-sort={sort.key === col.key ? (sort.dir === 1 ? 'ascending' : 'descending') : 'none'}>
                        <button type="button" className={styles.sortBtn} onClick={() => toggleSort(col.key)}>
                          {col.label}{sort.key === col.key ? (sort.dir === 1 ? ' ▲' : ' ▼') : ''}
                        </button>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {sorted.length === 0 && <tr><td colSpan={COLUMNS.length} className={styles.empty}>No attempts recorded yet.</td></tr>}
                  {sorted.map((row) => (
                    <tr key={row.level_id}>
                      {COLUMNS.map((col) => (
                        <td key={col.key} className={col.key === 'level_id' ? styles.mono : styles.num}>
                          {col.key === 'level_id' ? row.level_id : col.fmt ? col.fmt(row[col.key]) : row[col.key]}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          <section className={styles.section}>
            <h2 className={styles.sectionTitle}>Login stats (30 days)</h2>
            <div className={styles.chips}>
              {overview.logins.by_country.map((c) => <span key={`c-${c.name}`} className={styles.chip}>{c.name}: {c.count}</span>)}
              {overview.logins.by_device.map((c) => <span key={`d-${c.name}`} className={styles.chip}>{c.name}: {c.count}</span>)}
            </div>
          </section>

          <section className={styles.section}>
            <h2 className={styles.sectionTitle}>Users</h2>
            <div className={styles.tableWrap}>
              <table className={styles.table}>
                <thead><tr><th>Email</th><th>Name</th><th>Role</th><th>Joined</th><th>Last login</th><th className={styles.num}>Levels passed</th></tr></thead>
                <tbody>
                  {overview.users.list.map((u) => (
                    <tr key={u.id}>
                      <td>{u.email}</td><td>{u.name}</td><td>{u.role}</td><td>{day(u.created_at)}</td><td>{day(u.last_login_at)}</td>
                      <td className={styles.num}>{u.levels_passed}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          <section className={styles.section}>
            <h2 className={styles.sectionTitle}>Feedback</h2>
            <div className={styles.tableWrap}>
              <table className={styles.table}>
                <thead><tr><th>Date</th><th>Level</th><th className={styles.num}>Rating</th><th>Message</th></tr></thead>
                <tbody>
                  {overview.feedback.items.length === 0 && <tr><td colSpan={4} className={styles.empty}>No feedback yet.</td></tr>}
                  {overview.feedback.items.map((f) => (
                    <tr key={f.id}>
                      <td>{day(f.created_at)}</td><td className={styles.mono}>{f.level_id ?? '-'}</td>
                      <td className={styles.num}>{f.rating ?? '-'}</td><td className={styles.msg}>{f.message}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        </>
      )}
    </div>
  );
}
