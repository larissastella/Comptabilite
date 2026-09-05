/*
# Cycle de facturation (mensuel / annuel)

Billing.tsx affiche depuis un moment "Facturation annuelle disponible
avec 20% de réduction" — texte qui existait déjà sans qu'aucun code, sur
aucun des 5 PSP, n'implémente réellement un cycle annuel : tenants n'a
même pas de colonne pour le retenir. Un client qui choisissait "annuel"
(s'il y en avait eu un bouton) aurait payé... rien de spécifique, la
promesse était vide.

Cette migration ajoute la colonne ; la logique de calcul du montant et
d'activation par cycle est dans Billing.tsx + chaque fonction Edge de
paiement (payunit/flutterwave/paystack/stripe/paddle -checkout/init/verify/webhook).
*/

ALTER TABLE tenants ADD COLUMN IF NOT EXISTS billing_cycle text NOT NULL DEFAULT 'monthly'
  CHECK (billing_cycle IN ('monthly', 'annual'));

-- Each *_transactions table (PayUnit/Paystack/Paddle) is where the
-- expected amount is locked in server-side at checkout time, precisely
-- so verify/webhook never have to re-trust a client-supplied cycle when
-- deciding whether to set next_billing_date 30 or 365 days out.
ALTER TABLE payunit_transactions ADD COLUMN IF NOT EXISTS cycle text NOT NULL DEFAULT 'monthly'
  CHECK (cycle IN ('monthly', 'annual'));
ALTER TABLE paystack_transactions ADD COLUMN IF NOT EXISTS cycle text NOT NULL DEFAULT 'monthly'
  CHECK (cycle IN ('monthly', 'annual'));
ALTER TABLE paddle_transactions ADD COLUMN IF NOT EXISTS cycle text NOT NULL DEFAULT 'monthly'
  CHECK (cycle IN ('monthly', 'annual'));
