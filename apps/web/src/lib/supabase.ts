import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL ?? '';
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY ?? import.meta.env.VITE_SUPABASE_ANON_KEY ?? '';

export const supabaseConfigured = Boolean(supabaseUrl && supabaseAnonKey);

if (!supabaseConfigured) {
  console.warn('Supabase credentials not configured. Copy .env.example to .env.local and fill in your values.');
}

// createClient throws on an empty URL, which used to crash the whole app when
// env vars were missing. Fall back to a harmless placeholder so public pages
// still render and sign-in shows a clear error instead.
export const supabase = createClient(supabaseConfigured ? supabaseUrl : 'http://localhost.invalid', supabaseConfigured ? supabaseAnonKey : 'missing-key', {
  auth: {
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: true,
  },
});
