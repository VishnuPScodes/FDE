import { Hono } from 'hono';
import type { Env } from '../index';
import { authMiddleware } from '../middleware/auth';
import { getSupabaseAdmin } from '../lib/supabase';

export const consentRouter = new Hono<{ Bindings: Env }>();

/**
 * POST /consent
 * Records the user's consent acceptance.
 */
consentRouter.post('/', authMiddleware, async (c) => {
  const userId = c.get('userId') as string;
  const body = await c.req.json();
  const version = body.version as string;

  if (!version) {
    return c.json({ error: 'version is required' }, 400);
  }

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
  await supabase
    .from('profiles')
    .update({ consent_version: version, consent_at: new Date().toISOString() })
    .eq('id', userId);

  return c.json({ ok: true });
});
