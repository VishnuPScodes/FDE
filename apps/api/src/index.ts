import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { logger } from 'hono/logger';
import { healthRouter } from './routes/health';
import { sessionRouter } from './routes/session';
import { consentRouter } from './routes/consent';
import { meRouter } from './routes/me';
import { progressRouter } from './routes/progress';

export type Bindings = {
  ENVIRONMENT: string;
  SUPABASE_URL: string;
  SUPABASE_SERVICE_ROLE_KEY: string;
  SUPABASE_JWT_SECRET: string;
};

export type AppEnv = {
  Bindings: Bindings;
  Variables: { userId: string; userEmail: string; userRole: string };
};

const app = new Hono<AppEnv>();

// Middleware
app.use(
  '*',
  cors({
    origin: (origin) => {
      const allowed = [
        'https://fde-platform.pages.dev',
        'http://localhost:5173',
        'http://localhost:4173',
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
app.route('/session', sessionRouter);
app.route('/consent', consentRouter);
app.route('/me', meRouter);
app.route('/progress', progressRouter);


// 404 handler
app.notFound((c) => {
  return c.json({ error: 'Not found' }, 404);
});

// Error handler
app.onError((err, c) => {
  console.error('Unhandled error:', err);
  return c.json({ error: 'Internal server error' }, 500);
});

export default app;
