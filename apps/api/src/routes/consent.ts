import { Hono } from 'hono';
import { z } from 'zod';
import type { AppEnv } from '../index';
import { authMiddleware } from '../middleware/auth';
import { getSupabaseAdmin } from '../lib/supabase';

export const consentRouter = new Hono<AppEnv>();

export const ConsentSchema = z.object({ version: z.string().regex(/^\d+\.\d+$/) });

/**
 * POST /consent
 * Records the user's consent acceptance.
 */
consentRouter.post('/', authMiddleware, async (c) => {
  const userId = c.get('userId');
  const parsed = ConsentSchema.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) {
    return c.json({ error: 'version is required' }, 400);
  }
  const { version } = parsed.data;

  const ip = c.req.header('cf-connecting-ip') ?? c.req.header('x-forwarded-for') ?? '';
  const supabase = getSupabaseAdmin(c);

  // Record consent
  const { error } = await supabase.from('consents').insert({
    user_id: userId,
    version,
    ip,
  });

  if (error) {
    console.error('Failed to record consent:', error);
    return c.json({ error: 'Failed to record consent' }, 500);
  }

  // Update profile
  const { error: profileError } = await supabase
    .from('profiles')
    .update({ consent_version: version, consent_at: new Date().toISOString() })
    .eq('id', userId);
  if (profileError) {
    console.error('Failed to update profile consent:', profileError);
    return c.json({ error: 'Failed to record consent' }, 500);
  }

  return c.json({ ok: true });
});
