/*
# Factures récurrentes : réservé Premium/Entreprise, appliqué côté serveur

Le module de factures récurrentes (migration 012 : recurring_invoice_templates
+ generate_due_recurring_invoices()) existait en base depuis longtemps sans
jamais avoir eu d'interface ni de tâche planifiée — la fonctionnalité était
donc 0% utilisable, pour absolument tout le monde, peu importe le forfait.

En ajoutant l'interface et le cron (voir generate-recurring-invoices/index.ts
et billing-cron.yml), il faut aussi verrouiller l'accès à Premium/Entreprise
au niveau RLS — pas seulement en cachant le bouton côté interface, sinon
n'importe quel tenant Starter authentifié pourrait insérer directement une
ligne via l'API Supabase standard en contournant l'UI.
*/

CREATE OR REPLACE FUNCTION public.is_tenant_premium_or_above(tid uuid)
RETURNS boolean
LANGUAGE sql SECURITY DEFINER STABLE
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM tenants
    WHERE id = tid AND plan IN ('premium', 'enterprise')
  );
$$;

DROP POLICY IF EXISTS "rit_insert" ON recurring_invoice_templates;
CREATE POLICY "rit_insert" ON recurring_invoice_templates FOR INSERT TO authenticated
  WITH CHECK (is_tenant_member(tenant_id) AND (is_tenant_premium_or_above(tenant_id) OR is_super_admin()));

DROP POLICY IF EXISTS "rit_update" ON recurring_invoice_templates;
CREATE POLICY "rit_update" ON recurring_invoice_templates FOR UPDATE TO authenticated
  USING (is_tenant_member(tenant_id))
  WITH CHECK (is_tenant_member(tenant_id) AND (is_tenant_premium_or_above(tenant_id) OR is_super_admin()));

-- SELECT/DELETE stay as-is: a tenant that downgrades below Premium can
-- still see and delete/deactivate templates they already created (so
-- they don't lose visibility into what's still running), just can't
-- create new ones or edit existing ones while below Premium.
