/*
# Team invitations + plan user limits

## Problem
"Inviter un utilisateur" in the UI only wrote an audit_log row saying an
invite was "sent" — no invitation record was created, no way for the
invited person to actually join the tenant, and the advertised per-plan
user limits (2 / 5 / unlimited) were never enforced anywhere.

## Fix
1. `tenant_invitations` — a real, tokenized invitation a person can accept.
2. `create_tenant_invitation()` — admin-only, enforces the tenant's plan
   user limit before creating the invite.
3. `accept_tenant_invitation()` — called by the invited person once they
   are authenticated; validates the token belongs to their own email,
   attaches them to the tenant with the invited role, marks it accepted.
4. `tenants.max_users` — per-tenant seat cap, set from the plan on
   creation/plan change.
*/

ALTER TABLE tenants ADD COLUMN IF NOT EXISTS max_users integer NOT NULL DEFAULT 2;

CREATE TABLE IF NOT EXISTS tenant_invitations (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  email       text NOT NULL,
  role        text NOT NULL DEFAULT 'accountant',
  token       uuid NOT NULL DEFAULT gen_random_uuid(),
  status      text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'revoked', 'expired')),
  invited_by  uuid REFERENCES auth.users(id),
  expires_at  timestamptz NOT NULL DEFAULT (now() + interval '7 days'),
  accepted_at timestamptz,
  created_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (token)
);

ALTER TABLE tenant_invitations ENABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS idx_ti_tenant ON tenant_invitations(tenant_id);
CREATE INDEX IF NOT EXISTS idx_ti_email ON tenant_invitations(lower(email));

-- Admins of the tenant can see/manage its invitations. The invited person
-- is NOT granted SELECT via RLS (they don't have a tenant_users row yet) —
-- they interact only through the accept_tenant_invitation() RPC below,
-- which looks the invite up by token with elevated rights.
DROP POLICY IF EXISTS "ti_select" ON tenant_invitations;
CREATE POLICY "ti_select" ON tenant_invitations FOR SELECT TO authenticated
  USING (is_tenant_admin(tenant_id) OR is_super_admin());
DROP POLICY IF EXISTS "ti_update" ON tenant_invitations;
CREATE POLICY "ti_update" ON tenant_invitations FOR UPDATE TO authenticated
  USING (is_tenant_admin(tenant_id) OR is_super_admin())
  WITH CHECK (is_tenant_admin(tenant_id) OR is_super_admin());
-- No direct INSERT policy: creation always goes through
-- create_tenant_invitation() so the seat-limit check can't be bypassed.

-- Backfill max_users to match each tenant's current plan.
UPDATE tenants SET max_users = CASE plan
  WHEN 'starter' THEN 2
  WHEN 'pro' THEN 5
  WHEN 'premium' THEN 999999
  WHEN 'enterprise' THEN 999999
  ELSE 2
END
WHERE max_users = 2;

CREATE OR REPLACE FUNCTION create_tenant_invitation(p_tenant_id uuid, p_email text, p_role text)
RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_max_users integer;
  v_current_count integer;
  v_pending_count integer;
  v_token uuid;
BEGIN
  IF NOT (is_tenant_admin(p_tenant_id) OR is_super_admin()) THEN
    RAISE EXCEPTION 'Not authorized to invite for this tenant';
  END IF;

  SELECT max_users INTO v_max_users FROM tenants WHERE id = p_tenant_id;
  SELECT COUNT(*) INTO v_current_count FROM tenant_users WHERE tenant_id = p_tenant_id;
  SELECT COUNT(*) INTO v_pending_count FROM tenant_invitations
    WHERE tenant_id = p_tenant_id AND status = 'pending' AND expires_at > now();

  IF v_current_count + v_pending_count >= v_max_users THEN
    RAISE EXCEPTION 'SEAT_LIMIT_REACHED: plan allows % users (% active, % pending invites)',
      v_max_users, v_current_count, v_pending_count;
  END IF;

  UPDATE tenant_invitations SET status = 'revoked'
    WHERE tenant_id = p_tenant_id AND lower(email) = lower(p_email) AND status = 'pending';

  INSERT INTO tenant_invitations (tenant_id, email, role, invited_by)
  VALUES (p_tenant_id, lower(p_email), p_role, auth.uid())
  RETURNING token INTO v_token;

  RETURN v_token;
END;
$$;
REVOKE EXECUTE ON FUNCTION create_tenant_invitation(uuid, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION create_tenant_invitation(uuid, text, text) TO authenticated;

CREATE OR REPLACE FUNCTION accept_tenant_invitation(p_token uuid)
RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_invite tenant_invitations%ROWTYPE;
  v_user_email text;
  v_max_users integer;
  v_current_count integer;
BEGIN
  SELECT * INTO v_invite FROM tenant_invitations WHERE token = p_token FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'INVITE_NOT_FOUND';
  END IF;
  IF v_invite.status <> 'pending' THEN
    RAISE EXCEPTION 'INVITE_ALREADY_USED';
  END IF;
  IF v_invite.expires_at < now() THEN
    UPDATE tenant_invitations SET status = 'expired' WHERE id = v_invite.id;
    RAISE EXCEPTION 'INVITE_EXPIRED';
  END IF;

  SELECT email INTO v_user_email FROM auth.users WHERE id = auth.uid();
  IF v_user_email IS NULL OR lower(v_user_email) <> lower(v_invite.email) THEN
    RAISE EXCEPTION 'EMAIL_MISMATCH: this invitation was sent to a different email address';
  END IF;

  IF EXISTS (SELECT 1 FROM tenant_users WHERE tenant_id = v_invite.tenant_id AND user_id = auth.uid()) THEN
    UPDATE tenant_invitations SET status = 'accepted', accepted_at = now() WHERE id = v_invite.id;
    RETURN v_invite.tenant_id;
  END IF;

  SELECT max_users INTO v_max_users FROM tenants WHERE id = v_invite.tenant_id;
  SELECT COUNT(*) INTO v_current_count FROM tenant_users WHERE tenant_id = v_invite.tenant_id;
  IF v_current_count >= v_max_users THEN
    RAISE EXCEPTION 'SEAT_LIMIT_REACHED';
  END IF;

  INSERT INTO tenant_users (tenant_id, user_id, role, is_owner)
  VALUES (v_invite.tenant_id, auth.uid(), v_invite.role, false);

  UPDATE tenant_invitations SET status = 'accepted', accepted_at = now() WHERE id = v_invite.id;

  RETURN v_invite.tenant_id;
END;
$$;
REVOKE EXECUTE ON FUNCTION accept_tenant_invitation(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION accept_tenant_invitation(uuid) TO authenticated;

-- Lets an invited (not-yet-member) authenticated user look up basic,
-- non-sensitive info about a pending invite by token (tenant name, role)
-- so the accept-invite page can show "You've been invited to join X as Y"
-- before they click accept.
CREATE OR REPLACE FUNCTION get_invitation_preview(p_token uuid)
RETURNS TABLE (tenant_name text, role text, email text, status text, expires_at timestamptz)
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  SELECT t.name, ti.role, ti.email, ti.status, ti.expires_at
  FROM tenant_invitations ti
  JOIN tenants t ON t.id = ti.tenant_id
  WHERE ti.token = p_token;
END;
$$;
REVOKE EXECUTE ON FUNCTION get_invitation_preview(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION get_invitation_preview(uuid) TO authenticated, anon;

-- Keep max_users in sync with plan, both when a tenant is first created
-- (create_tenant_with_owner doesn't set it explicitly) and whenever a
-- super admin changes a tenant's plan afterwards.
CREATE OR REPLACE FUNCTION sync_max_users_with_plan()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF TG_OP = 'INSERT' OR NEW.plan IS DISTINCT FROM OLD.plan THEN
    NEW.max_users := CASE NEW.plan
      WHEN 'starter' THEN 2
      WHEN 'pro' THEN 5
      WHEN 'premium' THEN 999999
      WHEN 'enterprise' THEN 999999
      ELSE NEW.max_users
    END;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_max_users_with_plan ON tenants;
CREATE TRIGGER trg_sync_max_users_with_plan
  BEFORE INSERT OR UPDATE ON tenants
  FOR EACH ROW EXECUTE FUNCTION sync_max_users_with_plan();
