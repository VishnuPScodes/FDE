-- Admin role hardening (I18/I19). profiles.role already exists (default 'learner').
-- The "Users can update own profile" RLS policy would let a learner set role='admin'
-- from the browser, so block role changes for everyone except the service role / SQL editor.
CREATE OR REPLACE FUNCTION public.protect_profile_role()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = ''
AS $$
BEGIN
  IF NEW.role IS DISTINCT FROM OLD.role
     AND COALESCE(auth.role(), 'service_role') NOT IN ('service_role', 'supabase_admin') THEN
    RAISE EXCEPTION 'profiles.role can only be changed by an administrator';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS protect_profile_role ON public.profiles;
CREATE TRIGGER protect_profile_role
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.protect_profile_role();

-- Make someone an admin (run in the SQL editor, which is not subject to the check above):
--   UPDATE public.profiles SET role = 'admin' WHERE google_email = 'you@example.com';

CREATE INDEX IF NOT EXISTS idx_level_progress_level_id ON public.level_progress(level_id);
