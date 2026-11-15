import { Hono } from 'hono';
import type { Context, Next } from 'hono';
import type { AppEnv } from '../index';
import { authMiddleware } from '../middleware/auth';
import { getSupabaseAdmin } from '../lib/supabase';

/**
 * Admin-only endpoints (I18 content analytics, I19 admin page).
 * Admin = profiles.role === 'admin', read with the service role. The role cannot be
 * self-assigned (see supabase/migrations/003_admin.sql). Everything is computed from our
 * own tables; no third-party trackers.
 */
export const adminRouter = new Hono<AppEnv>();

const PAGE = 1000;
const DAY = 86400 * 1000;

type Row = Record<string, unknown>;
interface PagedQuery {
  range: (from: number, to: number) => PromiseLike<{ data: unknown; error: { message: string } | null }>;
}

/** Reads every row of a query in pages (PostgREST caps responses at 1000 rows). */
async function fetchAll(build: () => PagedQuery, maxRows = 50000): Promise<Row[] | null> {
  const out: Row[] = [];
  for (let from = 0; from < maxRows; from += PAGE) {
    const { data, error } = await build().range(from, from + PAGE - 1);
    if (error) return null;
    const rows = data as Row[];
    out.push(...rows);
    if (rows.length < PAGE) break;
  }
  return out;
}

async function requireAdmin(c: Context<AppEnv>, next: Next) {
  const supabase = getSupabaseAdmin(c);
  const { data, error } = await supabase.from('profiles').select('role').eq('id', c.get('userId')).maybeSingle();
  if (error) return c.json({ error: 'Could not verify admin access.' }, 500);
  if ((data as { role?: string } | null)?.role !== 'admin') return c.json({ error: 'Forbidden' }, 403);
  await next();
}

adminRouter.use('*', authMiddleware, requireAdmin);

const str = (v: unknown) => (typeof v === 'string' ? v : '');
const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : 0);

export interface LevelAnalytics {
  level_id: string;
  learners: number;
  passed: number;
  pass_rate: number;
  avg_attempts: number;
  avg_hints: number;
  drop_off: number;
  drop_off_rate: number;
}

/** Aggregates level_progress rows per level. Exported for tests. */
export function aggregateLevels(rows: Row[]): LevelAnalytics[] {
  const byLevel = new Map<string, { learners: number; passed: number; attempts: number; hints: number }>();
  for (const r of rows) {
    const id = str(r.level_id);
    if (!id) continue;
    const attempts = num(r.attempts);
    const status = str(r.status);
    // "Attempted" = tried at least once or progressed past unlocked.
    if (attempts === 0 && status !== 'in_progress' && status !== 'passed') continue;
    const a = byLevel.get(id) ?? { learners: 0, passed: 0, attempts: 0, hints: 0 };
    a.learners += 1;
    if (status === 'passed') a.passed += 1;
    a.attempts += attempts;
    a.hints += num(r.hints_used);
    byLevel.set(id, a);
  }
  const round = (n: number) => Math.round(n * 100) / 100;
  return [...byLevel.entries()]
    .map(([level_id, a]) => ({
      level_id,
      learners: a.learners,
      passed: a.passed,
      pass_rate: round(a.passed / a.learners),
      avg_attempts: round(a.attempts / a.learners),
      avg_hints: round(a.hints / a.learners),
      drop_off: a.learners - a.passed,
      drop_off_rate: round((a.learners - a.passed) / a.learners),
    }))
    .sort((x, y) => x.level_id.localeCompare(y.level_id));
}

adminRouter.get('/analytics', async (c) => {
  const supabase = getSupabaseAdmin(c);
  const rows = await fetchAll(() => supabase.from('level_progress').select('level_id,status,attempts,hints_used'));
  if (!rows) return c.json({ error: 'Could not load analytics.' }, 500);
  return c.json({ levels: aggregateLevels(rows), generated_at: new Date().toISOString() });
});

adminRouter.get('/overview', async (c) => {
  const supabase = getSupabaseAdmin(c);
  const now = Date.now();
  const d7 = new Date(now - 7 * DAY).toISOString();
  const d30 = new Date(now - 30 * DAY).toISOString();

  const [total, active7, active30, profilesRes, progressRes, loginsRes, feedbackRes] = await Promise.all([
    supabase.from('profiles').select('id', { count: 'exact', head: true }),
    supabase.from('profiles').select('id', { count: 'exact', head: true }).gte('last_login_at', d7),
    supabase.from('profiles').select('id', { count: 'exact', head: true }).gte('last_login_at', d30),
    supabase.from('profiles').select('id,google_email,full_name,created_at,last_login_at,role').order('created_at', { ascending: false }).limit(200),
    fetchAll(() => supabase.from('level_progress').select('user_id,status') as unknown as PagedQuery),
    fetchAll(() => supabase.from('login_events').select('user_id,created_at,country,device_type,browser').gte('created_at', d30) as unknown as PagedQuery, 20000),
    supabase.from('feedback').select('id,user_id,level_id,created_at,rating,message').order('created_at', { ascending: false }).limit(100),
  ]);
  if (total.error || profilesRes.error || feedbackRes.error || !progressRes || !loginsRes) {
    return c.json({ error: 'Could not load overview.' }, 500);
  }

  const passedBy = new Map<string, number>();
  for (const r of progressRes) if (r.status === 'passed') passedBy.set(str(r.user_id), (passedBy.get(str(r.user_id)) ?? 0) + 1);
  const users = (profilesRes.data as Row[]).map((p) => ({
    id: str(p.id),
    email: str(p.google_email),
    name: str(p.full_name),
    role: str(p.role) || 'learner',
    created_at: str(p.created_at),
    last_login_at: str(p.last_login_at),
    levels_passed: passedBy.get(str(p.id)) ?? 0,
  }));

  const tally = (key: string) => {
    const m = new Map<string, number>();
    for (const l of loginsRes) {
      const k = str(l[key]) || 'unknown';
      m.set(k, (m.get(k) ?? 0) + 1);
    }
    return [...m.entries()].map(([name, count]) => ({ name, count })).sort((a, b) => b.count - a.count).slice(0, 8);
  };

  const ratings = (feedbackRes.data as Row[]).map((f) => num(f.rating)).filter((n) => n > 0);
  return c.json({
    users: {
      total: total.count ?? 0,
      active_7d: active7.count ?? 0,
      active_30d: active30.count ?? 0,
      list: users,
    },
    logins: {
      last_30d: loginsRes.length,
      last_7d: loginsRes.filter((l) => str(l.created_at) >= d7).length,
      by_country: tally('country'),
      by_device: tally('device_type'),
    },
    feedback: {
      average_rating: ratings.length ? Math.round((ratings.reduce((a, b) => a + b, 0) / ratings.length) * 100) / 100 : null,
      items: (feedbackRes.data as Row[]).map((f) => ({
        id: str(f.id),
        level_id: str(f.level_id) || null,
        rating: typeof f.rating === 'number' ? f.rating : null,
        message: str(f.message),
        created_at: str(f.created_at),
      })),
    },
    generated_at: new Date().toISOString(),
  });
});
