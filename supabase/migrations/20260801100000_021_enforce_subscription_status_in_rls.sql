/*
# CRITICAL FIX: platform access was never actually blocked after trial/
# subscription expiry -- only the React UI hid it

## The bug
`is_tenant_member(tid)` -- the function used in the vast majority of RLS
policies across the whole schema (73 policy definitions) -- only ever
checked tenant membership. It never looked at `subscription_status` or
`trial_ends_at`. The "you must subscribe" screen (PlanSelectionGate) was
enforced ONLY in the React app (`ProtectedRoute`).

That meant anyone who is a member of a tenant could keep reading and
writing that tenant's data forever after their trial/subscription
lapsed, simply by calling the Supabase API directly (browser dev tools,
curl, Postman) with their own session -- completely bypassing the
"upgrade your plan" screen, since that screen is just a UI gate, not a
real permission boundary.

## The fix
`is_tenant_member()` now ALSO requires the tenant to be in good standing
(active subscription, or trial not yet expired). Since it's used almost
everywhere, this automatically re-locks the ~73 policies that call it --
no need to touch them individually.

A small number of places legitimately need to keep working even for an
expired tenant (otherwise a locked-out admin could never even see their
own "please pay" screen, or actually pay): those now explicitly use the
new `is_tenant_member_raw()` (pure membership, no status check) instead.

`is_tenant_admin()` has its own independent membership+role query (it
never called `is_tenant_member()` internally), so it is deliberately left
unchanged -- an expired tenant's admin can still access Settings/Billing
to fix their subscription; they just can't use the actual accounting
features (invoices, transactions, inventory, etc.) until they do.
*/

-- Pure membership check, no subscription status involved. Used only by
-- the handful of policies below that must keep working even when a
-- tenant's trial/subscription has lapsed.
CREATE OR REPLACE FUNCTION is_tenant_member_raw(tid uuid)
RETURNS boolean
LANGUAGE sql SECURITY DEFINER STABLE
AS $$
  SELECT EXISTS (
    SELECT 1 FROM tenant_users WHERE tenant_id = tid AND user_id = auth.uid()
  );
$$;

-- True if the tenant is in good standing: an active paid subscription,
-- or still within its trial window.
CREATE OR REPLACE FUNCTION is_tenant_active(tid uuid)
RETURNS boolean
LANGUAGE sql SECURITY DEFINER STABLE
AS $$
  SELECT EXISTS (
    SELECT 1 FROM tenants
    WHERE id = tid
      AND (
        subscription_status = 'active'
        OR (subscription_status = 'trialing' AND trial_ends_at > now())
      )
  );
$$;

-- THE ACTUAL FIX: is_tenant_member() now requires both membership AND
-- good standing. This is what ~73 existing RLS policies call, so they
-- all become enforced against real payment status automatically.
CREATE OR REPLACE FUNCTION is_tenant_member(tid uuid)
RETURNS boolean
LANGUAGE sql SECURITY DEFINER STABLE
AS $$
  SELECT is_tenant_member_raw(tid) AND (is_tenant_active(tid) OR is_super_admin());
$$;

REVOKE EXECUTE ON FUNCTION is_tenant_member_raw(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION is_tenant_member_raw(uuid) TO authenticated;
REVOKE EXECUTE ON FUNCTION is_tenant_active(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION is_tenant_active(uuid) TO authenticated;

-- Exception #1: a tenant must always be able to see its OWN row, even
-- expired -- otherwise a locked-out admin could never see their own
-- "please subscribe" status or reach the Billing page at all.
DROP POLICY IF EXISTS "tenant_select" ON tenants;
CREATE POLICY "tenant_select" ON tenants FOR SELECT
TO authenticated
USING (is_tenant_member_raw(id) OR is_super_admin());

-- Exception #2: tenant_invitations preview/accept must keep working
-- regardless of the inviting tenant's payment status, otherwise an
-- invited teammate could get stuck in a broken state. (accept_tenant_invitation
-- and get_invitation_preview are already SECURITY DEFINER and don't call
-- is_tenant_member, so no change needed there -- noted for completeness.)

-- Sanity note: tenant_users' own SELECT policy is
--   "user_id = auth.uid() OR is_tenant_member(tenant_id) OR is_super_admin()"
-- -- the first clause alone already lets a user see their own membership
-- row regardless of tenant status, so TenantContext's `.eq('user_id', ...)`
-- query is unaffected by this migration. No change needed there.
