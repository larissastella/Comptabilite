/*
# Index manquants sur tenant_id — performance RLS à l'échelle

Chaque policy RLS de ce projet filtre sur `tenant_id` (via
is_tenant_member(tenant_id) et consorts) — c'est ce qui garantit
l'isolation stricte entre tenants. Mais sans index sur cette colonne,
Postgres doit faire un scan séquentiel de TOUTE la table à chaque
requête pour appliquer ce filtre. Avec peu de lignes, ça ne se voit pas.
Avec des millions de lignes across tous les tenants, ça devient le
goulot d'étranglement n°1.

Cette migration ajoute les index manquants sur les tables métier qui en
avaient réellement besoin :
- credit_note_items, recurring_invoice_template_items,
  tenant_e_invoice_config : vraies tables métier, volume qui grossit
  avec l'usage.

Les autres tables `tenant_id` sans index détectées lors de l'audit
(api_idempotency_keys, billing_reminders_sent, function_errors,
client_errors, fx_rates) sont des tables de bookkeeping interne
(service role uniquement, faible volume de requêtes par rapport aux
tables métier) — pas de risque de performance immédiat, mais indexées
ici aussi par hygiène, sans coût réel vu leur taille.
*/

CREATE INDEX IF NOT EXISTS idx_credit_note_items_tenant ON credit_note_items(tenant_id);
CREATE INDEX IF NOT EXISTS idx_recurring_invoice_template_items_tenant ON recurring_invoice_template_items(tenant_id);
-- tenant_e_invoice_config.tenant_id is the PRIMARY KEY — already indexed
-- automatically by Postgres, no separate index needed.

CREATE INDEX IF NOT EXISTS idx_api_idempotency_keys_tenant ON api_idempotency_keys(tenant_id);
CREATE INDEX IF NOT EXISTS idx_billing_reminders_sent_tenant ON billing_reminders_sent(tenant_id);
CREATE INDEX IF NOT EXISTS idx_function_errors_tenant ON function_errors(tenant_id);
CREATE INDEX IF NOT EXISTS idx_client_errors_tenant ON client_errors(tenant_id);
CREATE INDEX IF NOT EXISTS idx_fx_rates_tenant ON fx_rates(tenant_id);
