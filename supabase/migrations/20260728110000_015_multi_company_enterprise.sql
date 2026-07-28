/*
# Multi-company (Enterprise)

## Isolation guarantee — unchanged
Each "company" is still just a `tenants` row with its own completely
separate accounts/invoices/transactions/stock/etc. Every table's RLS
policy still checks `is_tenant_member(tenant_id)` exactly as before —
nothing in this migration weakens that. A user who belongs to company A
and company B can only ever see A's data while "in" A, and B's data
while "in" B; there is no cross-company query anywhere, and switching
which company is "active" is a pure client-side display choice that
RLS re-validates on every single request regardless.

## What this adds
`create_additional_company()` — lets a user who already OWNS at least
one Enterprise-plan tenant create another company (another tenant row)
under their account, without touching the original `create_tenant_with_owner`
(still used for normal first-time signup, still blocks a second tenant
for everyone who isn't already an Enterprise owner).
*/

CREATE OR REPLACE FUNCTION create_additional_company(
  p_name text,
  p_country text DEFAULT 'CM',
  p_region text DEFAULT NULL,
  p_city text DEFAULT NULL,
  p_currency text DEFAULT 'XAF',
  p_timezone text DEFAULT 'Africa/Douala',
  p_phone_prefix text DEFAULT '+237',
  p_vat_rate numeric DEFAULT 19.25,
  p_sector text DEFAULT NULL,
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

  -- Gate: only someone who already OWNS at least one Enterprise-plan
  -- tenant may create an additional company. This is checked here, at
  -- the moment of creation, not just in the UI — so it can't be bypassed
  -- by calling the RPC directly.
  IF NOT EXISTS (
    SELECT 1 FROM tenant_users tu
    JOIN tenants t ON t.id = tu.tenant_id
    WHERE tu.user_id = v_user_id AND tu.is_owner = true AND t.plan = 'enterprise'
  ) THEN
    RAISE EXCEPTION 'MULTI_COMPANY_REQUIRES_ENTERPRISE';
  END IF;

  INSERT INTO tenants (name, country, region, city, currency, timezone,
    phone_prefix, vat_rate, plan, subscription_status, sector, invoice_prefix)
  VALUES (p_name, p_country, p_region, p_city, p_currency, p_timezone,
    p_phone_prefix, p_vat_rate, 'starter', 'trialing', p_sector, p_invoice_prefix)
  RETURNING id INTO v_tenant_id;

  INSERT INTO tenant_users (tenant_id, user_id, role, is_owner)
  VALUES (v_tenant_id, v_user_id, 'admin', true);

  INSERT INTO audit_logs (tenant_id, user_id, action, module, after_data)
  VALUES (v_tenant_id, v_user_id, 'create_additional_company', 'companies', jsonb_build_object('name', p_name));

  RETURN v_tenant_id;
END;
$$;

REVOKE EXECUTE ON FUNCTION create_additional_company(text, text, text, text, text, text, text, numeric, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION create_additional_company(text, text, text, text, text, text, text, numeric, text, text) TO authenticated;

-- Helper the frontend can call cheaply to decide whether to show
-- "+ Add a company" at all, without needing a service-role check.
CREATE OR REPLACE FUNCTION can_create_additional_company()
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM tenant_users tu
    JOIN tenants t ON t.id = tu.tenant_id
    WHERE tu.user_id = auth.uid() AND tu.is_owner = true AND t.plan = 'enterprise'
  );
$$;
REVOKE EXECUTE ON FUNCTION can_create_additional_company() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION can_create_additional_company() TO authenticated;
