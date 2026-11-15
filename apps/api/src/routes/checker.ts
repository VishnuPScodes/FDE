import { Hono } from 'hono';
import { z } from 'zod';
import type { AppEnv } from '../index';
import { authMiddleware } from '../middleware/auth';
import { getSupabaseAdmin } from '../lib/supabase';
import {
  decryptSigningKey,
  deriveSigningKey,
  encryptSigningKey,
  randomToken,
  sha256Hex,
  verifyPayloadSignature,
} from '../lib/checker-crypto';
import { LEVEL_ID_RE, consumeRateLimit, markLevelPassed, realworldEnv, recordRun } from '../lib/realworld';

export const checkerRouter = new Hono<AppEnv>();

/** Signed results older/newer than this are rejected (replay window). */
export const MAX_CLOCK_SKEW_SEC = 300;
const MAX_PAYLOAD_BYTES = 32 * 1024;

const SubmissionSchema = z.object({
  token_id: z.string().regex(/^[0-9a-f]{64}$/),
  payload: z.string().min(2).max(MAX_PAYLOAD_BYTES),
  signature: z.string().regex(/^[0-9a-f]{64}$/i),
});

export const CheckerPayloadSchema = z.object({
  v: z.literal(1),
  level_id: z.string().regex(LEVEL_ID_RE),
  token_id: z.string().regex(/^[0-9a-f]{64}$/),
  timestamp: z.number().int().positive(),
  nonce: z.string().regex(/^[0-9a-f]{32,64}$/),
  checker_version: z.string().max(40),
  results: z
    .array(
      z.object({
        id: z.string().max(80),
        name: z.string().max(200),
        passed: z.boolean(),
        detail: z.string().max(1000),
      }),
    )
    .min(1)
    .max(50),
});

/** Issue (or rotate) the signed-in learner's checker token. The token is returned once and never stored. */
checkerRouter.post('/token', authMiddleware, async (c) => {
  const secret = realworldEnv(c).CHECKER_KEY_SECRET;
  if (!secret || secret.length < 32) {
    console.error('CHECKER_KEY_SECRET is not configured');
    return c.json({ error: 'Checker tokens are not configured on this server yet.' }, 503);
  }
  const userId = c.get('userId');
  const supabase = getSupabaseAdmin(c);

  const limit = await consumeRateLimit(supabase, userId, 'checker_token', 10, 3600).catch(() => null);
  if (!limit) return c.json({ error: 'Could not issue a token right now.' }, 500);
  if (!limit.allowed) return c.json({ error: 'Too many new tokens this hour. Try again later.' }, 429);

  const token = randomToken('fdec_');
  const tokenHash = await sha256Hex(token);
  const signingKeyEnc = await encryptSigningKey(await deriveSigningKey(token), secret);
  const createdAt = new Date().toISOString();
  const { error } = await supabase.from('checker_tokens').upsert(
    {
      user_id: userId,
      token_hash: tokenHash,
      token_prefix: token.slice(0, 10),
      signing_key_enc: signingKeyEnc,
      created_at: createdAt,
      last_used_at: null,
    },
    { onConflict: 'user_id' },
  );
  if (error) return c.json({ error: 'Could not issue a token right now.' }, 500);
  return c.json({ token, token_prefix: token.slice(0, 10), created_at: createdAt, login_command: `fde-checker login ${token}` });
});

/** Receive signed results from the checker CLI. Authenticated by the HMAC signature, not a JWT. */
checkerRouter.post('/results', async (c) => {
  const secret = realworldEnv(c).CHECKER_KEY_SECRET;
  if (!secret || secret.length < 32) return c.json({ error: 'Checker is not configured on this server yet.' }, 503);

  const parsed = SubmissionSchema.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) return c.json({ error: 'Invalid checker submission.' }, 400);
  const { token_id: tokenId, payload, signature } = parsed.data;

  const supabase = getSupabaseAdmin(c);
  const { data: tokenRow, error: tokenError } = await supabase
    .from('checker_tokens')
    .select('user_id,signing_key_enc')
    .eq('token_hash', tokenId)
    .maybeSingle();
  if (tokenError) return c.json({ error: 'Could not verify the checker token.' }, 500);
  const row: { user_id: string; signing_key_enc: string } | null = tokenRow
    ? { user_id: String(tokenRow.user_id), signing_key_enc: String(tokenRow.signing_key_enc) }
    : null;
  if (!row) return c.json({ error: 'Unknown checker token. Generate a new one on the level page and run `fde-checker login <token>`.' }, 401);

  let signingKey: Uint8Array;
  try {
    signingKey = await decryptSigningKey(row.signing_key_enc, secret);
  } catch {
    return c.json({ error: 'Your checker token is no longer valid. Generate a new one on the level page.' }, 401);
  }
  if (!(await verifyPayloadSignature(signingKey, payload, signature))) {
    return c.json({ error: 'Signature does not match. Results were changed or the token is wrong.' }, 401);
  }

  let body: z.infer<typeof CheckerPayloadSchema>;
  try {
    const result = CheckerPayloadSchema.safeParse(JSON.parse(payload));
    if (!result.success) return c.json({ error: 'Checker payload has the wrong shape. Update fde-checker.' }, 400);
    body = result.data;
  } catch {
    return c.json({ error: 'Checker payload is not valid JSON.' }, 400);
  }
  if (body.token_id !== tokenId) return c.json({ error: 'Token mismatch in payload.' }, 401);
  const skew = Math.abs(Math.floor(Date.now() / 1000) - body.timestamp);
  if (skew > MAX_CLOCK_SKEW_SEC) {
    return c.json({ error: 'Result timestamp is too old or in the future. Check your computer clock and run verify again.' }, 401);
  }

  const limit = await consumeRateLimit(supabase, row.user_id, 'checker_results', 30, 3600).catch(() => null);
  if (!limit) return c.json({ error: 'Could not record the result right now.' }, 500);
  if (!limit.allowed) return c.json({ error: 'Too many checker runs this hour. Try again later.' }, 429);

  const passed = body.results.every((r) => r.passed);
  const recorded = await recordRun(supabase, {
    user_id: row.user_id,
    level_id: body.level_id,
    source: 'checker',
    passed,
    nonce: body.nonce,
    result: { results: body.results, checker_version: body.checker_version, timestamp: body.timestamp },
  });
  if (recorded.duplicate) return c.json({ error: 'This result was already submitted.' }, 409);
  if (!recorded.ok) return c.json({ error: 'Could not record the result right now.' }, 500);

  if (passed) await markLevelPassed(supabase, row.user_id, body.level_id);
  await supabase.from('checker_tokens').update({ last_used_at: new Date().toISOString() }).eq('user_id', row.user_id);
  return c.json({ ok: true, level_id: body.level_id, passed });
});

/** Latest checker result for a level, used by the web `checker_token` check. */
checkerRouter.get('/results/:levelId', authMiddleware, async (c) => {
  const levelId = c.req.param('levelId') ?? '';
  if (!LEVEL_ID_RE.test(levelId)) return c.json({ error: 'Invalid level id.' }, 400);
  const { data, error } = await getSupabaseAdmin(c)
    .from('realworld_runs')
    .select('created_at,passed,result')
    .eq('user_id', c.get('userId'))
    .eq('level_id', levelId)
    .eq('source', 'checker')
    .order('created_at', { ascending: false })
    .limit(1);
  if (error) return c.json({ error: 'Could not load checker results.' }, 500);
  const latest = (data as { created_at: string; passed: boolean; result: unknown }[] | null)?.[0];
  if (!latest) return c.json({ found: false, passed: false });
  return c.json({ found: true, passed: latest.passed, created_at: latest.created_at, result: latest.result });
});
