import { Hono } from 'hono';
import type { Context } from 'hono';
import { cors } from 'hono/cors';
import { logger } from 'hono/logger';
import { healthRouter } from './routes/health';
import { sessionRouter } from './routes/session';
import { consentRouter } from './routes/consent';
import { meRouter } from './routes/me';
import { progressRouter } from './routes/progress';
import { checkerRouter } from './routes/checker';
import { checksRouter } from './routes/checks';
import { usageRouter } from './routes/usage';
import { errorsRouter } from './routes/errors';
import { adminRouter } from './routes/admin';

export interface Bindings {
  ENVIRONMENT: string;
  SUPABASE_URL: string;
  SUPABASE_SERVICE_ROLE_KEY: string;
  /** Only for legacy HS256 projects. Projects on asymmetric JWT signing keys are verified via JWKS. */
  SUPABASE_JWT_SECRET?: string;
  /** Comma-separated extra CORS origins for deployed frontends, e.g. "https://fde.vercel.app". */
  ALLOWED_ORIGINS?: string;
  /** Vercel only: Vercel Cron sends `Authorization: Bearer <CRON_SECRET>` to /cron/keep-alive. */
  CRON_SECRET?: string;
}

export interface AppEnv {
  Bindings: Bindings;
  Variables: { userId: string; userEmail: string; userRole: string };
}

const app = new Hono<AppEnv>();

// Middleware
// Capstone usage pings come from learners' own deployed apps (any origin, no credentials).
app.use('/usage/ping', cors({ origin: '*', allowMethods: ['POST', 'OPTIONS'], allowHeaders: ['Content-Type'], maxAge: 86400 }));
app.use(
  '*',
  cors({
    origin: (origin, c: Context<AppEnv>) => {
      const allowed = [
        'https://fde-platform.pages.dev',
        'http://localhost:5173',
        'http://localhost:4173',
        // Extra deployed frontends (e.g. Vercel), comma-separated: ALLOWED_ORIGINS="https://fde.vercel.app"
        ...(c.env.ALLOWED_ORIGINS ?? '')
          .split(',')
          .map((o) => o.trim().replace(/\/+$/, ''))
          .filter(Boolean),
      ];
      return allowed.includes(origin) ? origin : null;
    },
    allowMethods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowHeaders: ['Content-Type', 'Authorization'],
    credentials: true,
    maxAge: 86400,
  }),
);

app.use('*', logger());

// Routes
app.route('/health', healthRouter);
// Vercel Cron entry point (Cloudflare uses the scheduled() handler below instead).
app.get('/cron/keep-alive', async (c) => {
  const secret = c.env.CRON_SECRET;
  if (!secret || c.req.header('Authorization') !== `Bearer ${secret}`) {
    return c.json({ error: 'Unauthorized' }, 401);
  }
  await keepSupabaseAwake(c.env);
  return c.json({ ok: true });
});
app.route('/session', sessionRouter);
app.route('/consent', consentRouter);
app.route('/me', meRouter);
app.route('/progress', progressRouter);
app.route('/checker', checkerRouter);
app.route('/realworld/checker', checkerRouter); // alias matching the build prompt's endpoint table
app.route('/checks', checksRouter);
app.route('/usage', usageRouter);
app.route('/errors', errorsRouter);
app.route('/admin', adminRouter);


// 404 handler
app.notFound((c) => {
  return c.json({ error: 'Not found' }, 404);
});

// Error handler
app.onError((err, c) => {
  console.error('Unhandled error:', err);
  return c.json({ error: 'Internal server error' }, 500);
});

/**
 * Daily cron (wrangler.toml [triggers]): a tiny authenticated read so the free-tier
 * Supabase project never counts as inactive and pauses.
 */
async function keepSupabaseAwake(env: Bindings): Promise<void> {
  if (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) {
    console.warn('keep-alive skipped: Supabase is not configured');
    return;
  }
  const res = await fetch(`${env.SUPABASE_URL}/rest/v1/profiles?select=id&limit=1`, {
    headers: { apikey: env.SUPABASE_SERVICE_ROLE_KEY },
  });
  console.log(`keep-alive: Supabase responded ${res.status}`);
}

export { app };

export default {
  fetch: app.fetch,
  scheduled(_event: ScheduledController, env: Bindings, ctx: ExecutionContext) {
    ctx.waitUntil(keepSupabaseAwake(env));
  },
} satisfies ExportedHandler<Bindings>;
