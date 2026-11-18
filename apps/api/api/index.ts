/**
 * Vercel entry point. Every path is rewritten here (see vercel.json) and handed to the
 * same Hono app that runs on Cloudflare Workers. On Workers, settings arrive as bindings
 * (c.env); on Vercel they come from process.env, so we pass them in explicitly.
 */
import { app, type Bindings } from '../src/index';
import type { RealworldBindings } from '../src/lib/realworld';

declare const process: { env: Record<string, string | undefined> };

// Edge runtime: the code is Workers-native (no Node APIs), and Edge bundles imports, so
// extensionless ESM imports like '../src/index' resolve. hnd1 keeps it near the database.
export const config = { runtime: 'edge', regions: ['hnd1'] };

function envFromProcess(): Bindings & RealworldBindings {
  const e = process.env;
  return {
    ENVIRONMENT: e.ENVIRONMENT ?? (e.VERCEL_ENV === 'production' ? 'production' : 'development'),
    SUPABASE_URL: e.SUPABASE_URL ?? '',
    SUPABASE_SERVICE_ROLE_KEY: e.SUPABASE_SERVICE_ROLE_KEY ?? '',
    SUPABASE_JWT_SECRET: e.SUPABASE_JWT_SECRET,
    ALLOWED_ORIGINS: e.ALLOWED_ORIGINS,
    CRON_SECRET: e.CRON_SECRET,
    // Read by realworld routes through realworldEnv(c)
    CHECKER_KEY_SECRET: e.CHECKER_KEY_SECRET,
    GITHUB_TOKEN: e.GITHUB_TOKEN,
  };
}

const handle = (request: Request): Response | Promise<Response> => app.fetch(request, envFromProcess());

export const GET = handle;
export const POST = handle;
export const PUT = handle;
export const PATCH = handle;
export const DELETE = handle;
export const OPTIONS = handle;
export const HEAD = handle;
