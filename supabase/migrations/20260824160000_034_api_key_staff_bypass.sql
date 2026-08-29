/*
# Correctif: create_api_key() exemptait le super admin de la restriction
# Enterprise, mais pas le staff interne

Règle métier établie: "super admin ET staff interne ne paient jamais
aucun forfait et ont accès à toute la plateforme sans restriction de
plan/abonnement". create_api_key() ne vérifiait que NOT is_super_admin()
pour lever la contrainte "Enterprise uniquement" — le staff interne
restait bloqué sur son propre tenant si celui-ci n'était pas Enterprise.

Ce correctif étend le contournement de palier à is_internal_staff(),
SANS toucher au contrôle d'appartenance (is_tenant_admin(p_tenant_id) OR
is_super_admin()) qui reste inchangé -- le staff reste limité à créer
des clés pour un tenant dont il est réellement admin, pas n'importe quel
tenant client. Cohérent avec le correctif équivalent déjà fait côté UI
(Settings.tsx: l'onglet API est maintenant visible pour super
admin/staff quel que soit le plan de leur propre tenant).
*/

CREATE OR REPLACE FUNCTION create_api_key(p_tenant_id uuid, p_name text, p_scopes text[])
RETURNS text
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_plan plan_type;
  v_plaintext text;
  v_hash text;
BEGIN
  IF NOT (is_tenant_admin(p_tenant_id) OR is_super_admin()) THEN
    RAISE EXCEPTION 'Not authorized for this tenant';
  END IF;

  SELECT plan INTO v_plan FROM tenants WHERE id = p_tenant_id;
  IF v_plan <> 'enterprise' AND NOT (is_super_admin() OR is_internal_staff()) THEN
    RAISE EXCEPTION 'API access requires the Enterprise plan';
  END IF;

  v_plaintext := 'lbk_' || encode(gen_random_bytes(24), 'base64');
  v_plaintext := replace(replace(replace(v_plaintext, '/', '_'), '+', '-'), '=', '');
  v_hash := encode(digest(v_plaintext, 'sha256'), 'hex');

  INSERT INTO api_keys (tenant_id, name, key_prefix, key_hash, scopes, created_by)
  VALUES (p_tenant_id, p_name, left(v_plaintext, 12), v_hash, p_scopes, auth.uid());

  RETURN v_plaintext;
END;
$$;

-- Cascading fix: even with create_api_key() now letting staff mint a key
-- for their own non-Enterprise tenant, verify_api_key() (re-checked on
-- EVERY API call, not just at creation -- migration 023) still required
-- plan = 'enterprise' with no exception, so that key would fail on its
-- very first real use. This function runs as service_role with no
-- acting auth.uid(), so we can't call is_super_admin()/is_internal_staff()
-- directly (those check the CURRENT session's user). Instead: bypass the
-- Enterprise requirement if ANY member of the key's own tenant is a
-- super admin or active staff member.
CREATE OR REPLACE FUNCTION verify_api_key(p_plaintext_key text)
RETURNS TABLE (tenant_id uuid, scopes text[])
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_hash text;
BEGIN
  v_hash := encode(digest(p_plaintext_key, 'sha256'), 'hex');

  UPDATE api_keys SET last_used_at = now()
  WHERE key_hash = v_hash AND revoked_at IS NULL;

  RETURN QUERY
  SELECT ak.tenant_id, ak.scopes
  FROM api_keys ak
  JOIN tenants t ON t.id = ak.tenant_id
  WHERE ak.key_hash = v_hash
    AND ak.revoked_at IS NULL
    AND (
      t.plan = 'enterprise'
      OR EXISTS (
        SELECT 1 FROM tenant_users tu
        WHERE tu.tenant_id = t.id
          AND (
            EXISTS (SELECT 1 FROM super_admins sa WHERE sa.user_id = tu.user_id)
            OR EXISTS (SELECT 1 FROM internal_staff_users isu WHERE isu.user_id = tu.user_id AND isu.is_active = true)
          )
      )
    )
    AND (t.subscription_status = 'active' OR (t.subscription_status = 'trialing' AND t.trial_ends_at > now()));
END;
$$;
REVOKE EXECUTE ON FUNCTION verify_api_key(text) FROM PUBLIC, anon, authenticated;

-- Cascading fix: same "super admin/staff never pay, always full access"
-- rule as above — neither function here exempted super admins or staff
-- from needing to already own an Enterprise-plan tenant before creating
-- an additional company.
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

  IF NOT (
    is_super_admin() OR is_internal_staff() OR EXISTS (
      SELECT 1 FROM tenant_users tu
      JOIN tenants t ON t.id = tu.tenant_id
      WHERE tu.user_id = v_user_id AND tu.is_owner = true AND t.plan = 'enterprise'
    )
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

CREATE OR REPLACE FUNCTION can_create_additional_company()
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT is_super_admin() OR is_internal_staff() OR EXISTS (
    SELECT 1 FROM tenant_users tu
    JOIN tenants t ON t.id = tu.tenant_id
    WHERE tu.user_id = auth.uid() AND tu.is_owner = true AND t.plan = 'enterprise'
  );
$$;
