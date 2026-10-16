import { Hono } from 'hono';
import type { AppEnv } from '../index';
import { authMiddleware } from '../middleware/auth';
import { getSupabaseAdmin } from '../lib/supabase';

export const meRouter = new Hono<AppEnv>();

/**
 * GET /me/export
 * Exports all user data as JSON (DPDP Act right to data portability).
 */
meRouter.get('/export', authMiddleware, async (c) => {
  const userId = c.get('userId') as string;
  const supabase = getSupabaseAdmin(c);

  const [profile, logins, devices, progress, submissions, consents, feedback] =
    await Promise.all([
      supabase.from('profiles').select('*').eq('id', userId).single(),
      supabase.from('login_events').select('*').eq('user_id', userId).order('created_at', { ascending: false }),
      supabase.from('devices').select('*').eq('user_id', userId),
      supabase.from('level_progress').select('*').eq('user_id', userId),
      supabase.from('submissions').select('*').eq('user_id', userId).order('created_at', { ascending: false }),
      supabase.from('consents').select('*').eq('user_id', userId),
      supabase.from('feedback').select('*').eq('user_id', userId),
    ]);

  return c.json({
    profile: profile.data,
    login_events: logins.data ?? [],
    devices: devices.data ?? [],
    level_progress: progress.data ?? [],
    submissions: submissions.data ?? [],
    consents: consents.data ?? [],
    feedback: feedback.data ?? [],
    exported_at: new Date().toISOString(),
  });
});

/**
 * DELETE /me
 * Deletes the user account and all associated data (DPDP Act right to erasure).
 * Uses Supabase admin client to delete from auth.users, which cascades.
 */
meRouter.delete('/', authMiddleware, async (c) => {
  const userId = c.get('userId') as string;
  const supabase = getSupabaseAdmin(c);

  // Delete from auth.users — CASCADE handles all related tables
  const { error } = await supabase.auth.admin.deleteUser(userId);

  if (error) {
    console.error('Failed to delete user:', error);
    return c.json({ error: 'Failed to delete account' }, 500);
  }

  return c.json({ ok: true, message: 'Account and all data permanently deleted' });
});
