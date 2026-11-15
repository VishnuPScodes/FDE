import { Hono } from 'hono';
import { z } from 'zod';
import type { AppEnv } from '../index';

/** Browser error reports. Logged to Workers logs only; no personal data is accepted. */
const ErrorReportSchema = z.object({
  message: z.string().min(1).max(500),
  stack: z.string().max(4000).optional(),
  path: z.string().max(300).regex(/^\/[^?#]*$/, 'path only, no query string').optional(),
  release: z.string().max(40).optional(),
  kind: z.enum(['error', 'unhandledrejection']).default('error'),
});

export const errorsRouter = new Hono<AppEnv>();

errorsRouter.post('/', async (c) => {
  const raw = await c.req.text().catch(() => '');
  if (raw.length > 8192) return c.json({ error: 'Report too large.' }, 413);
  let body: unknown = null;
  try {
    body = JSON.parse(raw);
  } catch {
    return c.json({ error: 'Invalid JSON.' }, 400);
  }
  const parsed = ErrorReportSchema.safeParse(body);
  if (!parsed.success) return c.json({ error: 'Invalid error report.' }, 400);
  console.error('client-error', JSON.stringify(parsed.data));
  return c.body(null, 204);
});
