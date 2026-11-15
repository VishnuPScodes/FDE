import type { Context } from 'hono';
import type { AppEnv, Bindings } from '../index';
import type { getSupabaseAdmin } from './supabase';

/** Extra Worker bindings used by the real-world level routes (all optional at type level). */
export interface RealworldBindings {
  /** ≥32 chars. Encrypts per-learner checker signing keys at rest. `wrangler secret put CHECKER_KEY_SECRET` */
  CHECKER_KEY_SECRET?: string;
  /** Optional free GitHub token (no scopes) to raise the GitHub API rate limit from 60 to 5000/hour. */
  GITHUB_TOKEN?: string;
}

export function realworldEnv(c: Context<AppEnv>): Bindings & RealworldBindings {
  // Bindings are a runtime record; the extra secrets are optional so a widening read is safe.
  return c.env;
}

export type SupabaseAdmin = ReturnType<typeof getSupabaseAdmin>;

export const LEVEL_ID_RE = /^p\d-w\d{2}-[a-z0-9-]+-\d{3}$/;

/** One check outcome returned to the web workspace. */
export interface RealworldCheckResult {
  name: string;
  passed: boolean;
  expected: string;
  actual: string;
}

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  retryAfterSec: number;
}

/**
 * Simple sliding-window limiter backed by Postgres (`api_rate_events`).
 * Counts events for (user, bucket) in the window; records a new event when allowed.
 * Not perfectly race-free, which is fine for abuse prevention on a free tier.
 */
export async function consumeRateLimit(
  supabase: SupabaseAdmin,
  subject: string,
  bucket: string,
  limit: number,
  windowSec: number,
): Promise<RateLimitResult> {
  const since = new Date(Date.now() - windowSec * 1000).toISOString();
  const { count, error } = await supabase
    .from('api_rate_events')
    .select('id', { count: 'exact', head: true })
    .eq('subject', subject)
    .eq('bucket', bucket)
    .gte('created_at', since);
  if (error) throw new Error(`rate limit read failed: ${error.message}`);
  const used = count ?? 0;
  if (used >= limit) return { allowed: false, remaining: 0, retryAfterSec: windowSec };
  const { error: insertError } = await supabase.from('api_rate_events').insert({ subject, bucket });
  if (insertError) throw new Error(`rate limit write failed: ${insertError.message}`);
  return { allowed: true, remaining: Math.max(0, limit - used - 1), retryAfterSec: 0 };
}

/** Record a real-world run. Failures are logged, not surfaced: the check result matters more. */
export async function recordRun(
  supabase: SupabaseAdmin,
  row: { user_id: string; level_id: string; source: 'checker' | 'live_url' | 'github'; result: unknown; passed: boolean; nonce?: string },
): Promise<{ duplicate: boolean; ok: boolean }> {
  const { error } = await supabase.from('realworld_runs').insert(row);
  if (!error) return { duplicate: false, ok: true };
  if (error.code === '23505') return { duplicate: true, ok: false };
  console.error('realworld_runs insert failed:', error.message);
  return { duplicate: false, ok: false };
}

/** Mark a level passed, keeping existing counters (mirrors routes/progress.ts semantics). */
export async function markLevelPassed(supabase: SupabaseAdmin, userId: string, levelId: string): Promise<void> {
  const { data: current } = await supabase
    .from('level_progress')
    .select('status,passed_at,first_opened_at,attempts,hints_used,time_spent_sec')
    .eq('user_id', userId)
    .eq('level_id', levelId)
    .maybeSingle();
  const now = new Date().toISOString();
  const row = current as { passed_at?: string | null; first_opened_at?: string | null; attempts?: number; hints_used?: number; time_spent_sec?: number } | null;
  const { error } = await supabase.from('level_progress').upsert(
    {
      user_id: userId,
      level_id: levelId,
      status: 'passed',
      attempts: (row?.attempts ?? 0) + 1,
      hints_used: row?.hints_used ?? 0,
      first_opened_at: row?.first_opened_at ?? now,
      passed_at: row?.passed_at ?? now,
      time_spent_sec: row?.time_spent_sec ?? 0,
    },
    { onConflict: 'user_id,level_id' },
  );
  if (error) console.error('level_progress upsert failed:', error.message);
}
