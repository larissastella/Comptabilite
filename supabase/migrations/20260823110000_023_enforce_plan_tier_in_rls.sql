/*
# Cohérence des accès: le niveau de forfait (plan) n'était vérifié que
# côté React (PremiumGate / PLAN_LIMITS), jamais en base

## Le problème
`PremiumGate` (src/components/ui/PremiumGate.tsx) cache déjà côté UI les
modules Fixed Assets, Bank Reconciliation et API Access aux forfaits qui
ne les incluent pas (voir PLAN_LIMITS dans src/lib/countryData.ts). Mais
en RLS, les policies de `fixed_assets`, `depreciation_entries` et
`bank_statement_lines` ne vérifiaient que `is_tenant_member(tenant_id)` —
sans aucun contrôle du forfait. Résultat: un tenant Starter ou Pro,
en appelant l'API Supabase directement (devtools, curl, Postman) avec
sa propre session, pouvait lire/écrire ces tables "Premium" malgré
l'UI qui les masque. C'est exactement la même classe de bug que le
correctif 021 (statut d'abonnement), mais pour le niveau de forfait.

`create_api_key()` vérifiait déjà bien `plan = 'enterprise'` à la
création — mais `verify_api_key()` (appelée à chaque requête via
l'edge function public-api) ne revérifiait jamais le forfait courant:
une clé créée sous Enterprise continuait de fonctionner indéfiniment
même après un downgrade vers un forfait inférieur.

## Le fix
- `is_tenant_plan_at_least(tid, min_plan)`: vérifie l'appartenance ET
  que le forfait actuel du tenant est au niveau requis ou au-dessus
  (ordre: starter < pro < premium < enterprise). Un super admin passe
  toujours.
- Policies de `fixed_assets` / `depreciation_entries` relevées à
  `premium` (SELECT/INSERT/UPDATE — DELETE reste sur is_tenant_admin,
  inchangé).
- Policies de `bank_statement_lines` relevées à `pro`.
- `verify_api_key()` revérifie désormais que le tenant est toujours
  Enterprise à chaque appel — une clé d'un tenant redescendu à un
  forfait inférieur cesse de fonctionner immédiatement (sans qu'il soit
  nécessaire de la révoquer manuellement).
*/

CREATE OR REPLACE FUNCTION public.is_tenant_plan_at_least(tid uuid, min_plan plan_type)
RETURNS boolean
LANGUAGE sql SECURITY DEFINER STABLE
SET search_path = public, pg_temp
AS $$
  SELECT is_tenant_member(tid) AND (
    is_super_admin()
    OR (
      SELECT CASE t.plan
        WHEN 'starter' THEN 1
        WHEN 'pro' THEN 2
        WHEN 'premium' THEN 3
        WHEN 'enterprise' THEN 4
      END >= CASE min_plan
        WHEN 'starter' THEN 1
        WHEN 'pro' THEN 2
        WHEN 'premium' THEN 3
        WHEN 'enterprise' THEN 4
      END
      FROM tenants t WHERE t.id = tid
    )
  );
$$;

REVOKE EXECUTE ON FUNCTION public.is_tenant_plan_at_least(uuid, plan_type) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_tenant_plan_at_least(uuid, plan_type) TO authenticated;

-- ============================================================
-- fixed_assets / depreciation_entries -> Premium et au-dessus
-- ============================================================
DROP POLICY IF EXISTS "fa_select" ON fixed_assets;
CREATE POLICY "fa_select" ON fixed_assets FOR SELECT TO authenticated
  USING (is_tenant_plan_at_least(tenant_id, 'premium') OR is_super_admin());
DROP POLICY IF EXISTS "fa_insert" ON fixed_assets;
CREATE POLICY "fa_insert" ON fixed_assets FOR INSERT TO authenticated
  WITH CHECK (is_tenant_plan_at_least(tenant_id, 'premium'));
DROP POLICY IF EXISTS "fa_update" ON fixed_assets;
CREATE POLICY "fa_update" ON fixed_assets FOR UPDATE TO authenticated
  USING (is_tenant_plan_at_least(tenant_id, 'premium')) WITH CHECK (is_tenant_plan_at_least(tenant_id, 'premium'));
-- fa_delete stays as-is (is_tenant_admin + accumulated_depreciation = 0):
-- an admin of a since-downgraded tenant must still be able to clean up.

DROP POLICY IF EXISTS "de_select" ON depreciation_entries;
CREATE POLICY "de_select" ON depreciation_entries FOR SELECT TO authenticated
  USING (is_tenant_plan_at_least(tenant_id, 'premium') OR is_super_admin());
DROP POLICY IF EXISTS "de_insert" ON depreciation_entries;
CREATE POLICY "de_insert" ON depreciation_entries FOR INSERT TO authenticated
  WITH CHECK (is_tenant_plan_at_least(tenant_id, 'premium'));

-- ============================================================
-- bank_statement_lines -> Pro et au-dessus
-- ============================================================
DROP POLICY IF EXISTS "bsl_select" ON bank_statement_lines;
CREATE POLICY "bsl_select" ON bank_statement_lines FOR SELECT TO authenticated
  USING (is_tenant_plan_at_least(tenant_id, 'pro') OR is_super_admin());
DROP POLICY IF EXISTS "bsl_insert" ON bank_statement_lines;
CREATE POLICY "bsl_insert" ON bank_statement_lines FOR INSERT TO authenticated
  WITH CHECK (is_tenant_plan_at_least(tenant_id, 'pro'));
DROP POLICY IF EXISTS "bsl_update" ON bank_statement_lines;
CREATE POLICY "bsl_update" ON bank_statement_lines FOR UPDATE TO authenticated
  USING (is_tenant_plan_at_least(tenant_id, 'pro')) WITH CHECK (is_tenant_plan_at_least(tenant_id, 'pro'));
-- bsl_delete stays as-is (is_tenant_admin + status != 'matched').

-- ============================================================
-- api_keys: revérifier le forfait à CHAQUE usage, pas seulement à
-- la création (sinon une clé survit à un downgrade)
-- ============================================================
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
    AND t.plan = 'enterprise'
    AND (t.subscription_status = 'active' OR (t.subscription_status = 'trialing' AND t.trial_ends_at > now()));
END;
$$;
REVOKE EXECUTE ON FUNCTION verify_api_key(text) FROM PUBLIC, anon, authenticated;
