import { Hono } from 'hono';
import { z } from 'zod';
import type { AppEnv } from '../index';
import { authMiddleware } from '../middleware/auth';
import { getSupabaseAdmin } from '../lib/supabase';
import { randomToken } from '../lib/checker-crypto';
import { LEVEL_ID_RE } from '../lib/realworld';

/**
 * Capstone usage pings. A learner creates an app key, embeds it in their
 * deployed app, and the app calls POST /usage/ping when a real user does
 * something. The learner (and only the learner) can read daily counts.
 */
export const usageRouter = new Hono<AppEnv>();

export const PINGS_PER_KEY_PER_DAY = 1000;
const MAX_KEYS_PER_USER = 5;
const APP_KEY_RE = /^fdeapp_[A-Za-z0-9_-]{20,64}$/;

const CreateKeySchema = z.object({
  label: z.string().trim().min(1).max(80).default('My capstone app'),
  level_id: z.string().regex(LEVEL_ID_RE).optional(),
});

const PingSchema = z.object({
  app_key: z.string().regex(APP_KEY_RE),
  event: z.string().max(60).optional(),
});

usageRouter.post('/keys', authMiddleware, async (c) => {
  const parsed = CreateKeySchema.safeParse(await c.req.json().catch(() => ({})));
  if (!parsed.success) return c.json({ error: 'Invalid app key request.' }, 400);
  const userId = c.get('userId');
  const supabase = getSupabaseAdmin(c);
  const { count, error: countError } = await supabase.from('usage_apps').select('app_key', { count: 'exact', head: true }).eq('user_id', userId);
  if (countError) return c.json({ error: 'Could not create an app key.' }, 500);
  if ((count ?? 0) >= MAX_KEYS_PER_USER) return c.json({ error: `You can have at most ${String(MAX_KEYS_PER_USER)} app keys.` }, 409);
  const appKey = randomToken('fdeapp_', 24);
  const { error } = await supabase.from('usage_apps').insert({ app_key: appKey, user_id: userId, label: parsed.data.label, level_id: parsed.data.level_id ?? null });
  if (error) return c.json({ error: 'Could not create an app key.' }, 500);
  return c.json({ app_key: appKey, label: parsed.data.label }, 201);
});

/**
 * Public ping. Accepts JSON sent as application/json or text/plain
 * (text/plain + sendBeacon avoids a CORS preflight from browsers).
 */
usageRouter.post('/ping', async (c) => {
  const raw = await c.req.text().catch(() => '');
  if (raw.length > 1024) return c.json({ error: 'Ping body too large.' }, 413);
  let json: unknown = null;
  try {
    json = JSON.parse(raw);
  } catch {
    /* handled by schema below */
  }
  const parsed = PingSchema.safeParse(json);
  if (!parsed.success) return c.json({ error: 'Send {"app_key":"fdeapp_..."}' }, 400);

  const supabase = getSupabaseAdmin(c);
  const { data: app, error: appError } = await supabase.from('usage_apps').select('app_key').eq('app_key', parsed.data.app_key).maybeSingle();
  if (appError) return c.json({ error: 'Could not record ping.' }, 500);
  if (!app) return c.json({ error: 'Unknown app key.' }, 404);

  const { data: newCount, error } = (await supabase.rpc('record_usage_ping', { p_app_key: parsed.data.app_key, p_limit: PINGS_PER_KEY_PER_DAY })) as { data: unknown; error: { message: string } | null };
  if (error) return c.json({ error: 'Could not record ping.' }, 500);
  if (typeof newCount !== 'number' || newCount < 0) {
    c.header('Retry-After', '3600');
    return c.json({ error: `Daily ping limit (${String(PINGS_PER_KEY_PER_DAY)}) reached for this key.` }, 429);
  }
  return c.json({ ok: true, today: newCount }, 202);
});

usageRouter.get('/:appKey/summary', authMiddleware, async (c) => {
  const appKey = c.req.param('appKey') ?? '';
  if (!APP_KEY_RE.test(appKey)) return c.json({ error: 'Not found' }, 404);
  const supabase = getSupabaseAdmin(c);
  const { data: app, error: appError } = await supabase.from('usage_apps').select('app_key,user_id,label,created_at').eq('app_key', appKey).maybeSingle();
  if (appError) return c.json({ error: 'Could not load usage.' }, 500);
  const owner = app as { user_id: string; label: string; created_at: string } | null;
  // Same 404 for "missing" and "not yours" so keys cannot be probed.
  if (owner?.user_id !== c.get('userId')) return c.json({ error: 'Not found' }, 404);

  const since = new Date(Date.now() - 30 * 86400 * 1000).toISOString().slice(0, 10);
  const { data, error } = await supabase.from('usage_daily').select('day,count').eq('app_key', appKey).gte('day', since).order('day', { ascending: true });
  if (error) return c.json({ error: 'Could not load usage.' }, 500);
  const days = data as { day: string; count: number }[];
  return c.json({ app_key: appKey, label: owner.label, created_at: owner.created_at, total_30d: days.reduce((sum, d) => sum + d.count, 0), days });
});
