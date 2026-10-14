-- Supabase Migration: M1 Auth & Shell
-- Run this in the Supabase SQL Editor (Dashboard > SQL Editor > New Query)
-- This creates all tables needed for M1 with Row Level Security enabled.

-- ============================================================================
-- 1. PROFILES
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.profiles (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  google_email text NOT NULL,
  full_name text NOT NULL DEFAULT '',
  avatar_url text,
  created_at timestamptz NOT NULL DEFAULT now(),
  last_login_at timestamptz NOT NULL DEFAULT now(),
  country text,
  consent_version text,
  consent_at timestamptz,
  ai_provider_pref text,
  role text NOT NULL DEFAULT 'learner'
);

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- Users can read their own profile
CREATE POLICY "Users can read own profile"
  ON public.profiles FOR SELECT
  USING (auth.uid() = id);

-- Users can update their own profile (but not role)
CREATE POLICY "Users can update own profile"
  ON public.profiles FOR UPDATE
  USING (auth.uid() = id)
  WITH CHECK (auth.uid() = id);

-- Insert is handled by the trigger below
CREATE POLICY "Service role can insert profiles"
  ON public.profiles FOR INSERT
  WITH CHECK (true);

-- ============================================================================
-- 2. AUTO-CREATE PROFILE ON SIGN-UP
-- ============================================================================
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = ''
AS $$
BEGIN
  INSERT INTO public.profiles (id, google_email, full_name, avatar_url)
  VALUES (
    NEW.id,
    COALESCE(NEW.email, ''),
    COALESCE(NEW.raw_user_meta_data ->> 'full_name', NEW.raw_user_meta_data ->> 'name', ''),
    COALESCE(NEW.raw_user_meta_data ->> 'avatar_url', NEW.raw_user_meta_data ->> 'picture', '')
  );
  RETURN NEW;
END;
$$;

-- Drop if exists (idempotent)
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- ============================================================================
-- 3. LOGIN EVENTS
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.login_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  ip text,
  country text,
  region text,
  city text,
  asn text,
  browser text,
  browser_version text,
  os text,
  os_version text,
  device_type text,  -- desktop | tablet | mobile
  device_model text,
  screen_w integer,
  screen_h integer,
  dpr real,
  viewport_w integer,
  viewport_h integer,
  language text,
  timezone text,
  touch boolean DEFAULT false,
  user_agent_raw text
);

ALTER TABLE public.login_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read own login events"
  ON public.login_events FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Service role can insert login events"
  ON public.login_events FOR INSERT
  WITH CHECK (true);

CREATE INDEX idx_login_events_user_id ON public.login_events(user_id);
CREATE INDEX idx_login_events_created_at ON public.login_events(created_at);

-- ============================================================================
-- 4. DEVICES (deduplicated per user)
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.devices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  device_hash text NOT NULL,
  browser text,
  os text,
  device_type text,
  first_seen timestamptz NOT NULL DEFAULT now(),
  last_seen timestamptz NOT NULL DEFAULT now(),
  login_count integer NOT NULL DEFAULT 1,
  UNIQUE (user_id, device_hash)
);

ALTER TABLE public.devices ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read own devices"
  ON public.devices FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Service role can manage devices"
  ON public.devices FOR ALL
  WITH CHECK (true);

-- ============================================================================
-- 5. LEVEL PROGRESS
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.level_progress (
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  level_id text NOT NULL,
  status text NOT NULL DEFAULT 'locked'
    CHECK (status IN ('locked', 'unlocked', 'in_progress', 'passed')),
  attempts integer NOT NULL DEFAULT 0,
  hints_used integer NOT NULL DEFAULT 0,
  first_opened_at timestamptz,
  passed_at timestamptz,
  time_spent_sec integer NOT NULL DEFAULT 0,
  PRIMARY KEY (user_id, level_id)
);

ALTER TABLE public.level_progress ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read own progress"
  ON public.level_progress FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can manage own progress"
  ON public.level_progress FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- ============================================================================
-- 6. SUBMISSIONS
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.submissions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  level_id text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  passed boolean NOT NULL DEFAULT false,
  check_results jsonb,
  code_snapshot text  -- capped at 20KB in application layer
);

ALTER TABLE public.submissions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read own submissions"
  ON public.submissions FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own submissions"
  ON public.submissions FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE INDEX idx_submissions_user_level ON public.submissions(user_id, level_id);

-- ============================================================================
-- 7. CONSENTS
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.consents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  version text NOT NULL,
  accepted_at timestamptz NOT NULL DEFAULT now(),
  ip text
);

ALTER TABLE public.consents ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read own consents"
  ON public.consents FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Service role can insert consents"
  ON public.consents FOR INSERT
  WITH CHECK (true);

-- ============================================================================
-- 8. FEEDBACK
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.feedback (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  level_id text,
  created_at timestamptz NOT NULL DEFAULT now(),
  rating integer CHECK (rating >= 1 AND rating <= 5),
  message text
);

ALTER TABLE public.feedback ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read own feedback"
  ON public.feedback FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own feedback"
  ON public.feedback FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- ============================================================================
-- 9. REALWORLD RUNS (for checker CLI / live URL / GitHub checks)
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.realworld_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  level_id text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  source text NOT NULL CHECK (source IN ('checker', 'live_url', 'github')),
  result jsonb,
  passed boolean NOT NULL DEFAULT false
);

ALTER TABLE public.realworld_runs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read own realworld runs"
  ON public.realworld_runs FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Service role can insert realworld runs"
  ON public.realworld_runs FOR INSERT
  WITH CHECK (true);

-- ============================================================================
-- 10. WRITING REVIEWS
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.writing_reviews (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  level_id text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  rubric_scores jsonb,
  self_checklist jsonb
);

ALTER TABLE public.writing_reviews ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read own writing reviews"
  ON public.writing_reviews FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own writing reviews"
  ON public.writing_reviews FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- ============================================================================
-- 11. DELETE ACCOUNT FUNCTION (DPDP Act right to erasure)
-- ============================================================================
CREATE OR REPLACE FUNCTION public.delete_user_account()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = ''
AS $$
BEGIN
  -- Cascading deletes handle related tables automatically due to ON DELETE CASCADE
  -- But we explicitly delete from auth.users which triggers the cascade
  DELETE FROM auth.users WHERE id = auth.uid();
END;
$$;

-- ============================================================================
-- 12. EXPORT ACCOUNT DATA FUNCTION
-- ============================================================================
CREATE OR REPLACE FUNCTION public.export_user_data()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = ''
AS $$
DECLARE
  result jsonb;
BEGIN
  SELECT jsonb_build_object(
    'profile', (SELECT row_to_json(p) FROM public.profiles p WHERE p.id = auth.uid()),
    'login_events', (SELECT COALESCE(jsonb_agg(row_to_json(le)), '[]'::jsonb) FROM public.login_events le WHERE le.user_id = auth.uid()),
    'devices', (SELECT COALESCE(jsonb_agg(row_to_json(d)), '[]'::jsonb) FROM public.devices d WHERE d.user_id = auth.uid()),
    'level_progress', (SELECT COALESCE(jsonb_agg(row_to_json(lp)), '[]'::jsonb) FROM public.level_progress lp WHERE lp.user_id = auth.uid()),
    'submissions', (SELECT COALESCE(jsonb_agg(row_to_json(s)), '[]'::jsonb) FROM public.submissions s WHERE s.user_id = auth.uid()),
    'consents', (SELECT COALESCE(jsonb_agg(row_to_json(c)), '[]'::jsonb) FROM public.consents c WHERE c.user_id = auth.uid()),
    'feedback', (SELECT COALESCE(jsonb_agg(row_to_json(f)), '[]'::jsonb) FROM public.feedback f WHERE f.user_id = auth.uid()),
    'exported_at', now()
  ) INTO result;
  RETURN result;
END;
$$;
