import { Hono } from 'hono';
import type { AppEnv } from '../index';
import { authMiddleware } from '../middleware/auth';
import { getSupabaseAdmin } from '../lib/supabase';

export const sessionRouter = new Hono<AppEnv>();

/**
 * POST /session/login-event
 * Records a login event with device info.
 * Also upserts the device (deduplicated by device_hash).
 *
 * The IP and geo data come from Cloudflare request headers.
 */
sessionRouter.post('/login-event', authMiddleware, async (c) => {
  const userId = c.get('userId') as string;
  const body = await c.req.json();

  // Extract geo from Cloudflare headers (free, no API needed)
  const ip = c.req.header('cf-connecting-ip') ?? c.req.header('x-forwarded-for') ?? '';
  const country = c.req.header('cf-ipcountry') ?? '';
  const city = (c.req.raw as unknown as { cf?: { city?: string } }).cf?.city ?? '';
  const region = (c.req.raw as unknown as { cf?: { region?: string } }).cf?.region ?? '';
  const asn = (c.req.raw as unknown as { cf?: { asn?: string } }).cf?.asn ?? '';

  const supabase = getSupabaseAdmin(c);

  // Insert login event
  const { error: eventError } = await supabase.from('login_events').insert({
    user_id: userId,
    ip,
    country,
    city,
    region,
    asn: String(asn),
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

  // Generate a simple device hash for deduplication
  const deviceHash = await generateDeviceHash([
    body.browser ?? '',
    body.os ?? '',
    body.deviceType ?? '',
    body.deviceModel ?? '',
    String(body.screenW ?? 0),
    String(body.screenH ?? 0),
  ].join('|'));

  // Upsert device
  const { error: deviceError } = await supabase.from('devices').upsert(
    {
      user_id: userId,
      device_hash: deviceHash,
      browser: body.browser ?? '',
      os: body.os ?? '',
      device_type: body.deviceType ?? 'desktop',
      last_seen: new Date().toISOString(),
      login_count: 1,
    },
    {
      onConflict: 'user_id,device_hash',
    },
  );

  // If upsert worked as insert (new device), we're done.
  // If it conflicted, we need to increment login_count and update last_seen.
  if (!deviceError) {
    // Try to increment login_count for existing devices
    try {
      await supabase.rpc('increment_device_login', {
        p_user_id: userId,
        p_device_hash: deviceHash,
      });
    } catch {
      // RPC may not exist yet — that's fine, the upsert still works
    }
  }

  return c.json({ ok: true });
});

async function generateDeviceHash(input: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(input);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = new Uint8Array(hashBuffer);
  return Array.from(hashArray)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
    .slice(0, 16); // First 16 hex chars is sufficient
}
