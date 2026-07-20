
/*
# Fix: Make super_admin signup trigger non-fatal

## Problem
The trigger `handle_super_admin_signup` on auth.users could throw an exception
and cause "Database error saving new user" during signup. Supabase requires
triggers on auth.users to never fail or they block user creation entirely.

## Fix
- Wrap trigger body in BEGIN/EXCEPTION so any error is silently swallowed
- Use fully schema-qualified table references (public.)
- Re-create the trigger cleanly
*/

CREATE OR REPLACE FUNCTION public.handle_super_admin_signup()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  BEGIN
    IF EXISTS (
      SELECT 1 FROM public.super_admin_emails WHERE email = NEW.email
    ) THEN
      INSERT INTO public.super_admins (user_id, email)
      VALUES (NEW.id, NEW.email)
      ON CONFLICT (user_id) DO NOTHING;
    END IF;
  EXCEPTION WHEN OTHERS THEN
    -- Non-fatal: never block user creation
    NULL;
  END;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created_super_admin ON auth.users;
CREATE TRIGGER on_auth_user_created_super_admin
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_super_admin_signup();

-- Also fix update_updated_at to be schema-qualified
CREATE OR REPLACE FUNCTION public.update_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;
