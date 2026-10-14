import { Hono } from 'hono';
import type { Env } from '../index';

export const healthRouter = new Hono<{ Bindings: Env }>();

healthRouter.get('/', (c) => {
  return c.json({
    status: 'ok',
    environment: c.env.ENVIRONMENT ?? 'unknown',
    timestamp: new Date().toISOString(),
    version: '0.0.1',
  });
});
