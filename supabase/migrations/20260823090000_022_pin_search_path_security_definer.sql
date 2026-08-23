/*
# Security fix: pin search_path on all remaining SECURITY DEFINER functions

## The bug
A SECURITY DEFINER function runs with the privileges of its owner, not the
caller. If it doesn't pin `search_path`, an attacker who can create objects
in a schema that appears earlier in the caller's search_path (e.g. a table
or function named `tenants`, `tenant_users`, `is_super_admin`... in a
schema they control) can get the function to silently resolve unqualified
references to their malicious objects instead of the real `public` ones.
This is Postgres CVE-2018-1058-class behaviour and is the #1 finding of
Supabase's own security linter ("function_search_path_mutable").

19 functions across earlier migrations were created as SECURITY DEFINER
without `SET search_path`. This migration pins all of them to
`public, pg_temp` via ALTER FUNCTION — no change to any function's logic,
just closing the search_path attack surface. (A handful of other
SECURITY DEFINER functions, e.g. `next_invoice_number`,
`handle_super_admin_signup`, `create_tenant_with_owner`, were already
fixed by later migrations that re-created them with search_path set —
not touched here.)
*/

ALTER FUNCTION public.is_super_admin() SET search_path = public, pg_temp;
ALTER FUNCTION public.my_tenant_id() SET search_path = public, pg_temp;
ALTER FUNCTION public.is_tenant_member(uuid) SET search_path = public, pg_temp;
ALTER FUNCTION public.is_tenant_admin(uuid) SET search_path = public, pg_temp;

ALTER FUNCTION public.is_internal_staff() SET search_path = public, pg_temp;
ALTER FUNCTION public.my_staff_role_id() SET search_path = public, pg_temp;
ALTER FUNCTION public.my_staff_code() SET search_path = public, pg_temp;
ALTER FUNCTION public.can_staff_access(text, text) SET search_path = public, pg_temp;
ALTER FUNCTION public.can_delete_super_admin() SET search_path = public, pg_temp;
ALTER FUNCTION public.generate_staff_code() SET search_path = public, pg_temp;
ALTER FUNCTION public.auto_generate_staff_code() SET search_path = public, pg_temp;

ALTER FUNCTION public.log_referral_event(text, referral_event_type, uuid, jsonb) SET search_path = public, pg_temp;
ALTER FUNCTION public.recompute_staff_stats(text) SET search_path = public, pg_temp;
ALTER FUNCTION public.get_conversion_funnel(int) SET search_path = public, pg_temp;
ALTER FUNCTION public.get_churn_rate(int) SET search_path = public, pg_temp;
ALTER FUNCTION public.log_referral_on_tenant_create() SET search_path = public, pg_temp;
ALTER FUNCTION public.log_referral_on_status_change() SET search_path = public, pg_temp;

ALTER FUNCTION public.is_tenant_member_raw(uuid) SET search_path = public, pg_temp;
ALTER FUNCTION public.is_tenant_active(uuid) SET search_path = public, pg_temp;

-- ============================================================
-- Real fix (not just search_path): tenant-assets storage policies used
-- current_user_tenant_id(), which does `SELECT ... LIMIT 1` with no
-- ORDER BY across a user's tenant_users rows. That was fine when a user
-- could only ever belong to one tenant, but migration 015 (multi-company
-- Enterprise) made it possible to belong to several -- so this returned
-- an arbitrary tenant_id unrelated to whichever company the user is
-- actually uploading a logo/cachet for, silently rejecting valid uploads
-- (or worse, letting one land under the wrong company's folder).
--
-- Fix: replace the "equals my one guessed tenant_id" check with "the
-- path's tenant_id is one I'm actually a member of" -- correct for any
-- number of companies, no frontend change needed since the folder name
-- in the upload path already names the target tenant explicitly.
-- ============================================================
CREATE OR REPLACE FUNCTION public.is_member_of_tenant_path(p_tenant_id text)
RETURNS boolean
LANGUAGE sql SECURITY DEFINER STABLE
SET search_path = public, pg_temp
AS $$
  SELECT EXISTS (
    SELECT 1 FROM tenant_users
    WHERE user_id = auth.uid() AND tenant_id::text = p_tenant_id
  );
$$;

REVOKE EXECUTE ON FUNCTION public.is_member_of_tenant_path(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_member_of_tenant_path(text) TO authenticated;

DROP POLICY IF EXISTS "tenant_assets_upload" ON storage.objects;
CREATE POLICY "tenant_assets_upload" ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'tenant-assets'
  AND public.is_member_of_tenant_path((storage.foldername(name))[1])
);

DROP POLICY IF EXISTS "tenant_assets_update" ON storage.objects;
CREATE POLICY "tenant_assets_update" ON storage.objects FOR UPDATE
TO authenticated
USING (
  bucket_id = 'tenant-assets'
  AND public.is_member_of_tenant_path((storage.foldername(name))[1])
)
WITH CHECK (
  bucket_id = 'tenant-assets'
  AND public.is_member_of_tenant_path((storage.foldername(name))[1])
);

DROP POLICY IF EXISTS "tenant_assets_delete" ON storage.objects;
CREATE POLICY "tenant_assets_delete" ON storage.objects FOR DELETE
TO authenticated
USING (
  bucket_id = 'tenant-assets'
  AND public.is_member_of_tenant_path((storage.foldername(name))[1])
);

-- current_user_tenant_id() is no longer used by these policies but is
-- kept (with search_path now pinned) in case other code still calls it.
ALTER FUNCTION public.current_user_tenant_id() SET search_path = public, pg_temp;
