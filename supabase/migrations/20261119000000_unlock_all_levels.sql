-- Per-user override that opens every level regardless of progress.
-- Like profiles.role, only the service role / SQL editor may change it.
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS unlock_all_levels boolean NOT NULL DEFAULT false;

CREATE OR REPLACE FUNCTION public.protect_profile_role()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = ''
AS $$
BEGIN
  IF (NEW.role IS DISTINCT FROM OLD.role OR NEW.unlock_all_levels IS DISTINCT FROM OLD.unlock_all_levels)
     AND COALESCE(auth.role(), 'service_role') NOT IN ('service_role', 'supabase_admin') THEN
    RAISE EXCEPTION 'profiles.role and profiles.unlock_all_levels can only be changed by an administrator';
  END IF;
  RETURN NEW;
END;
$$;

-- Unlock everything for one learner (run in the SQL editor):
--   UPDATE public.profiles SET unlock_all_levels = true WHERE google_email = 'learner@example.com';
