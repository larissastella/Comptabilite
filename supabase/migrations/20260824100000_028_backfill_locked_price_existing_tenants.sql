/*
# Backfill locked_price_usd pour les clients déjà actifs

La migration 027 a ajouté `locked_price_usd`, mais elle est NULL pour
tous les tenants déjà actifs — la colonne n'existait pas avant. Sans ce
backfill, un client déjà payant aujourd'hui ne serait "verrouillé" qu'à
son PROCHAIN paiement/upgrade — c'est-à-dire au nouveau tarif (14/29/79/
199 $), pas l'ancien qu'il avait accepté (9/19/69/189 $).

Ce backfill fige l'ANCIEN tarif pour tout tenant déjà en
subscription_status='active' au moment de cette migration — ce sont des
clients qui ont déjà payé, donc déjà "engagés" à l'ancien prix. Les
tenants encore en essai (trialing) ne sont volontairement PAS concernés
ici : ils n'ont encore rien payé, donc quand ils paieront pour la
première fois, flutterwave-verify/webhook les verrouillera normalement
au tarif EN VIGUEUR à ce moment-là (le nouveau).

Ne touche jamais un tenant dont locked_price_usd est déjà renseigné
(éviter d'écraser un verrouillage déjà fait par un paiement récent).
*/

UPDATE tenants
SET locked_price_usd = CASE plan
  WHEN 'starter' THEN 9
  WHEN 'pro' THEN 19
  WHEN 'premium' THEN 69
  WHEN 'enterprise' THEN 189
END
WHERE subscription_status = 'active'
  AND locked_price_usd IS NULL
  AND plan IN ('starter', 'pro', 'premium', 'enterprise');
