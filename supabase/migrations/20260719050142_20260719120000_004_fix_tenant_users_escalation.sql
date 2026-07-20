/*
# Fix: Privilege escalation via tenant_users INSERT policy

## Problem
The `tu_insert` policy on `tenant_users` allowed any authenticated user to add
themselves to ANY tenant via the clause `OR user_id = auth.uid()`. This was a
privilege escalation vulnerability: a user from Tenant A could insert a row
granting themselves admin access to Tenant B.

Verified breach in testing:
- Tenant A user (auth.uid = 1111...) successfully inserted themselves as
  admin+owner into Tenant B (tenant_id = bbbb...).

## Fix
1. Tighten `tu_insert` WITH CHECK to require `is_tenant_admin(tenant_id) OR
   is_super_admin()` only. The `user_id = auth.uid()` clause is removed.
2. To preserve the onboarding flow (a brand-new user creates their first
   tenant and must add themselves as owner in the same transaction), introduce
   a SECURITY DEFINER function `create_tenant_with_owner` that performs both
   inserts with elevated privileges. The frontend onboarding will call this
   function instead of doing two separate inserts.
3. Update the onboarding page to use the new RPC.

## Security impact
- After fix: a user can ONLY be added to a tenant by an existing admin of that
  tenant (or a super admin). Self-add is no longer possible.
- Onboarding still works because the RPC creates the tenant AND the owner row
  atomically with the calling user's identity.
- Super admins retain cross-tenant access via `is_super_admin()`.

## Tables affected
- `tenant_users` (policy change only — no schema change)
*/

-- -------------------------------------------------------
-- 1. Tighten tenant_users INSERT policy
-- -------------------------------------------------------
ALTER TABLE tenant_users DISABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "tu_insert" ON tenant_users;
CREATE POLICY "tu_insert" ON tenant_users FOR INSERT
TO authenticated
WITH CHECK (is_tenant_admin(tenant_id) OR is_super_admin());

DROP POLICY IF EXISTS "tu_select" ON tenant_users;
CREATE POLICY "tu_select" ON tenant_users FOR SELECT
TO authenticated
USING (user_id = auth.uid() OR is_tenant_member(tenant_id) OR is_super_admin());

DROP POLICY IF EXISTS "tu_update" ON tenant_users;
CREATE POLICY "tu_update" ON tenant_users FOR UPDATE
TO authenticated
USING (is_tenant_admin(tenant_id) OR is_super_admin())
WITH CHECK (is_tenant_admin(tenant_id) OR is_super_admin());

DROP POLICY IF EXISTS "tu_delete" ON tenant_users;
CREATE POLICY "tu_delete" ON tenant_users FOR DELETE
TO authenticated
USING (is_tenant_admin(tenant_id) OR is_super_admin());

ALTER TABLE tenant_users ENABLE ROW LEVEL SECURITY;

-- -------------------------------------------------------
-- 2. SECURITY DEFINER function for onboarding
-- -------------------------------------------------------
-- Creates a new tenant and adds the calling user as owner/admin atomically.
-- This bypasses the tu_insert RLS check because the function runs as the
-- postgres superuser (SECURITY DEFINER), but only ever inserts the owner row
-- for auth.uid() — never for an arbitrary user_id.

CREATE OR REPLACE FUNCTION public.create_tenant_with_owner(
  p_name text,
  p_country text DEFAULT 'CM',
  p_region text DEFAULT NULL,
  p_city text DEFAULT NULL,
  p_currency text DEFAULT 'XAF',
  p_timezone text DEFAULT 'Africa/Douala',
  p_phone_prefix text DEFAULT '+237',
  p_vat_rate numeric DEFAULT 19.25,
  p_plan plan_type DEFAULT 'starter',
  p_sector text DEFAULT NULL,
  p_logo_url text DEFAULT NULL,
  p_cachet_url text DEFAULT NULL,
  p_invoice_prefix text DEFAULT 'FAC'
)
RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_tenant_id uuid;
  v_user_id uuid := auth.uid();
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  -- Prevent creating a second tenant if user already owns one
  IF EXISTS (SELECT 1 FROM tenant_users WHERE user_id = v_user_id AND is_owner = true) THEN
    RAISE EXCEPTION 'User already owns a tenant';
  END IF;

  INSERT INTO tenants (name, country, region, city, currency, timezone,
    phone_prefix, vat_rate, plan, sector, logo_url, cachet_url, invoice_prefix)
  VALUES (p_name, p_country, p_region, p_city, p_currency, p_timezone,
    p_phone_prefix, p_vat_rate, p_plan, p_sector, p_logo_url, p_cachet_url, p_invoice_prefix)
  RETURNING id INTO v_tenant_id;

  INSERT INTO tenant_users (tenant_id, user_id, role, is_owner)
  VALUES (v_tenant_id, v_user_id, 'admin', true);

  RETURN v_tenant_id;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.create_tenant_with_owner FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.create_tenant_with_owner TO authenticated;
