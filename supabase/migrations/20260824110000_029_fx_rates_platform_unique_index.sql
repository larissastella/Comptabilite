/*
# Index unique partiel pour permettre le vrai upsert des taux plateforme

La contrainte UNIQUE (tenant_id, currency_from, currency_to, rate_date)
de la migration 011 ne suffit pas pour un ON CONFLICT sur les lignes
"plateforme" (tenant_id IS NULL) : en SQL standard, deux NULL ne sont
jamais considérés égaux par une contrainte UNIQUE classique, donc chaque
exécution du sync quotidien (fx-rates-sync) créerait une nouvelle ligne
au lieu de mettre à jour celle de la veille.

Un index unique PARTIEL (WHERE tenant_id IS NULL) résout ça — Postgres
sait alors cibler explicitement ces lignes pour ON CONFLICT.
*/

CREATE UNIQUE INDEX IF NOT EXISTS idx_fx_rates_platform_unique
  ON fx_rates (currency_from, currency_to, rate_date)
  WHERE tenant_id IS NULL;
