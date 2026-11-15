-- Supabase Migration 002: M18 real-world levels
-- Checker CLI tokens, replay protection for checker results, per-user rate
-- limiting for server-side checks, and capstone usage pings.
--
-- All tables have RLS enabled. The Worker uses the service role (bypasses RLS);
-- policies below only grant learners read access to their own, non-secret rows.

-- ============================================================================
-- 1. CHECKER TOKENS (one active token per learner)
-- ============================================================================
-- token_hash      = hex(SHA-256(token)); the token itself is never stored.
-- signing_key_enc = AES-GCM(HMAC-SHA256(token, 'fde-checker-signing-v1')) under
--                   the Worker secret CHECKER_KEY_SECRET. See apps/checker/README.md.
CREATE TABLE IF NOT EXISTS public.checker_tokens (
  user_id uuid PRIMARY KEY REFERENCES public.profiles(id) ON DELETE CASCADE,
  token_hash text NOT NULL UNIQUE CHECK (token_hash ~ '^[0-9a-f]{64}$'),
  token_prefix text NOT NULL,
  signing_key_enc text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  last_used_at timestamptz
);

ALTER TABLE public.checker_tokens ENABLE ROW LEVEL SECURITY;
-- No learner policies: rows hold encrypted key material and are only touched by the service role.

-- ============================================================================
-- 2. REALWORLD RUNS: replay protection for signed checker results
-- ============================================================================
ALTER TABLE public.realworld_runs ADD COLUMN IF NOT EXISTS nonce text;
CREATE UNIQUE INDEX IF NOT EXISTS idx_realworld_runs_nonce
  ON public.realworld_runs(nonce) WHERE nonce IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_realworld_runs_user_level
  ON public.realworld_runs(user_id, level_id, source, created_at DESC);

-- ============================================================================
-- 3. API RATE EVENTS (sliding-window counters, e.g. 20 checks/hour/user)
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.api_rate_events (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  subject text NOT NULL,          -- user id
  bucket text NOT NULL,           -- 'checks' | 'checker_results' | 'checker_token'
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.api_rate_events ENABLE ROW LEVEL SECURITY;
-- Service role only.

CREATE INDEX IF NOT EXISTS idx_api_rate_events_lookup
  ON public.api_rate_events(subject, bucket, created_at);

-- Keep the table tiny on the free tier. Call from the daily cron / SQL editor.
CREATE OR REPLACE FUNCTION public.prune_api_rate_events()
RETURNS void
LANGUAGE sql
SET search_path = ''
AS $$
  DELETE FROM public.api_rate_events WHERE created_at < now() - interval '2 days';
$$;

-- ============================================================================
-- 4. CAPSTONE USAGE PINGS
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.usage_apps (
  app_key text PRIMARY KEY CHECK (app_key ~ '^fdeapp_[A-Za-z0-9_-]{20,64}$'),
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  label text NOT NULL DEFAULT 'My capstone app',
  level_id text,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.usage_apps ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can read own usage apps" ON public.usage_apps;
CREATE POLICY "Users can read own usage apps"
  ON public.usage_apps FOR SELECT
  USING (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS idx_usage_apps_user ON public.usage_apps(user_id);

CREATE TABLE IF NOT EXISTS public.usage_daily (
  app_key text NOT NULL REFERENCES public.usage_apps(app_key) ON DELETE CASCADE,
  day date NOT NULL,
  count integer NOT NULL DEFAULT 0 CHECK (count >= 0),
  PRIMARY KEY (app_key, day)
);

ALTER TABLE public.usage_daily ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can read own usage counts" ON public.usage_daily;
CREATE POLICY "Users can read own usage counts"
  ON public.usage_daily FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM public.usage_apps a
    WHERE a.app_key = usage_daily.app_key AND a.user_id = auth.uid()
  ));

-- Atomically add one ping for today (UTC). Returns the new count, or -1 when
-- the per-key daily limit is already reached.
CREATE OR REPLACE FUNCTION public.record_usage_ping(p_app_key text, p_limit integer)
RETURNS integer
LANGUAGE plpgsql
SET search_path = ''
AS $$
DECLARE
  new_count integer;
BEGIN
  INSERT INTO public.usage_daily AS u (app_key, day, count)
  VALUES (p_app_key, (now() AT TIME ZONE 'utc')::date, 1)
  ON CONFLICT (app_key, day) DO UPDATE
    SET count = u.count + 1
    WHERE u.count < p_limit
  RETURNING u.count INTO new_count;
  RETURN COALESCE(new_count, -1);
END;
$$;

REVOKE ALL ON FUNCTION public.record_usage_ping(text, integer) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.record_usage_ping(text, integer) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.record_usage_ping(text, integer) TO service_role;

REVOKE ALL ON FUNCTION public.prune_api_rate_events() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.prune_api_rate_events() FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.prune_api_rate_events() TO service_role;
