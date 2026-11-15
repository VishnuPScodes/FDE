import { Hono } from 'hono';
import { z } from 'zod';
import type { AppEnv } from '../index';
import { authMiddleware } from '../middleware/auth';
import { getSupabaseAdmin } from '../lib/supabase';

export const sessionRouter = new Hono<AppEnv>();

const text = (max: number) => z.string().max(max).catch('');
const num = (max: number) => z.number().finite().min(0).max(max).catch(0);

/** Device data sent by the browser (spec R4). Every field is bounded and optional. */
export const LoginEventSchema = z.object({
  browser: text(64),
  browserVersion: text(64),
  os: text(64),
  osVersion: text(64),
  deviceType: z.enum(['mobile', 'tablet', 'desktop']).catch('desktop'),
  deviceModel: text(128),
  screenW: num(20000),
  screenH: num(20000),
  dpr: num(10).transform((value) => value || 1),
  viewportW: num(20000),
  viewportH: num(20000),
  language: text(35),
  timezone: text(64),
  touch: z.boolean().catch(false),
  userAgentRaw: text(512),
}).partial();

interface CfProperties { city?: string; region?: string; asn?: number | string }

/**
 * POST /session/login-event
 * Records a login event with device info and upserts the device
 * (deduplicated by device_hash), incrementing its login count.
 * IP and geo data come from Cloudflare request headers.
 */
sessionRouter.post('/login-event', authMiddleware, async (c) => {
  const userId = c.get('userId');
  const parsed = LoginEventSchema.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) return c.json({ error: 'Invalid login event' }, 400);
  const body = parsed.data;

  const ip = c.req.header('cf-connecting-ip') ?? c.req.header('x-forwarded-for') ?? '';
  const country = c.req.header('cf-ipcountry') ?? '';
  const cf = (c.req.raw as unknown as { cf?: CfProperties }).cf;

  const supabase = getSupabaseAdmin(c);
  const { error: eventError } = await supabase.from('login_events').insert({
    user_id: userId,
    ip,
    country,
    city: cf?.city ?? '',
    region: cf?.region ?? '',
    asn: String(cf?.asn ?? ''),
    browser: body.browser ?? '',
    browser_version: body.browserVersion ?? '',
    os: body.os ?? '',
    os_version: body.osVersion ?? '',
    device_type: body.deviceType ?? 'desktop',
    device_model: body.deviceModel ?? '',
    screen_w: body.screenW ?? 0,
    screen_h: body.screenH ?? 0,
    dpr: body.dpr ?? 1,
    viewport_w: body.viewportW ?? 0,
    viewport_h: body.viewportH ?? 0,
    language: body.language ?? '',
    timezone: body.timezone ?? '',
    touch: body.touch ?? false,
    user_agent_raw: body.userAgentRaw ?? '',
  });

  if (eventError) {
    console.error('Failed to insert login event:', eventError);
    return c.json({ error: 'Failed to record login event' }, 500);
  }

  const deviceHash = await generateDeviceHash([
    body.browser ?? '',
    body.os ?? '',
    body.deviceType ?? '',
    body.deviceModel ?? '',
    String(body.screenW ?? 0),
    String(body.screenH ?? 0),
  ].join('|'));

  // Read the current count so repeat logins increment it instead of
  // resetting it to 1 on every upsert.
  const { data: existing } = await supabase
    .from('devices')
    .select('login_count')
    .eq('user_id', userId)
    .eq('device_hash', deviceHash)
    .maybeSingle<{ login_count: number | null }>();

  const { error: deviceError } = await supabase.from('devices').upsert(
    {
      user_id: userId,
      device_hash: deviceHash,
      browser: body.browser ?? '',
      os: body.os ?? '',
      device_type: body.deviceType ?? 'desktop',
      last_seen: new Date().toISOString(),
      login_count: (existing?.login_count ?? 0) + 1,
    },
    { onConflict: 'user_id,device_hash' },
  );
  if (deviceError) console.error('Failed to upsert device:', deviceError);

  return c.json({ ok: true });
});

async function generateDeviceHash(input: string): Promise<string> {
  const hashBuffer = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(input));
  return Array.from(new Uint8Array(hashBuffer))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
    .slice(0, 16);
}
