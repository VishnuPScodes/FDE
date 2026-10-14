import { createClient } from '@supabase/supabase-js';
import type { Context } from 'hono';
import type { Env } from '../index';

/**
 * Creates a Supabase admin client (service role) for use in API routes.
 * This client bypasses RLS — only use in trusted server-side code.
 */
export function getSupabaseAdmin(c: Context<{ Bindings: Env }>) {
  return createClient(c.env.SUPABASE_URL, c.env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
}
