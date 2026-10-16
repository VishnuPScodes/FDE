import { Hono } from 'hono';
import { z } from 'zod';
import type { AppEnv } from '../index';
import { authMiddleware } from '../middleware/auth';
import { getSupabaseAdmin } from '../lib/supabase';

export const progressRouter = new Hono<AppEnv>();

export const ProgressUpdateSchema = z.object({
  level_id: z.string().regex(/^p\d-w\d{2}-[a-z0-9-]+-\d{3}$/),
  status: z.enum(['in_progress', 'passed']),
  attempts: z.number().int().min(0).max(10000),
  hints_used: z.number().int().min(0).max(100),
  time_spent_sec: z.number().int().min(0).max(60 * 60 * 24 * 365),
});

progressRouter.get('/', authMiddleware, async (c) => {
  const userId = c.get('userId');
  const { data, error } = await getSupabaseAdmin(c)
    .from('level_progress')
    .select('level_id,status,attempts,hints_used,first_opened_at,passed_at,time_spent_sec')
    .eq('user_id', userId);
  if (error) return c.json({ error: 'Could not load progress' }, 500);
  return c.json({ progress: data ?? [] });
});

progressRouter.post('/', authMiddleware, async (c) => {
  const parsed = ProgressUpdateSchema.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) return c.json({ error: 'Invalid progress update', details: parsed.error.flatten() }, 400);

  const userId = c.get('userId');
  const supabase = getSupabaseAdmin(c);
  const { data: current, error: readError } = await supabase
    .from('level_progress')
    .select('status,passed_at,first_opened_at,attempts,hints_used,time_spent_sec')
    .eq('user_id', userId)
    .eq('level_id', parsed.data.level_id)
    .maybeSingle();
  if (readError) return c.json({ error: 'Could not update progress' }, 500);

  const now = new Date().toISOString();
  const status = current?.status === 'passed' ? 'passed' : parsed.data.status;
  const { error } = await supabase.from('level_progress').upsert({
    user_id: userId,
    level_id: parsed.data.level_id,
    status,
    attempts: Math.max(current?.attempts ?? 0, parsed.data.attempts),
    hints_used: Math.max(current?.hints_used ?? 0, parsed.data.hints_used),
    first_opened_at: current?.first_opened_at ?? now,
    passed_at: current?.passed_at ?? (status === 'passed' ? now : null),
    time_spent_sec: Math.max(current?.time_spent_sec ?? 0, parsed.data.time_spent_sec),
  }, { onConflict: 'user_id,level_id' });
  if (error) return c.json({ error: 'Could not update progress' }, 500);
  return c.json({ ok: true, level_id: parsed.data.level_id, status });
});
