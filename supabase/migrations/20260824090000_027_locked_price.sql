/*
# Prix verrouillé (grandfathering)

Jusqu'ici, PLAN_PRICE_USD était une table figée dans le code de chaque
fonction — si le prix change (comme ça vient d'arriver: 9->14, 19->29,
69->79, 189->199 $), TOUT LE MONDE paie le nouveau prix au prochain
cycle, y compris les clients déjà en renouvellement automatique qui
avaient accepté un prix différent. Pour un paiement ponctuel (Mobile
Money, PayUnit) ce n'est pas grave — le client voit le prix courant à
chaque fois avant de payer. Mais pour le renouvellement automatique
(carte Flutterwave tokenisée, débitée sans repasser par une page de
paiement), c'est un vrai risque de surprise, potentiellement un
problème de confiance client.

`tenants.locked_price_usd` fige le prix au moment où le tenant paie —
c'est CE prix qui est débité automatiquement à chaque renouvellement,
jamais le prix "courant" du plan. Si un tenant change explicitement de
forfait (upgrade/downgrade), le prix se reverrouille au nouveau tarif à
ce moment-là — c'est un choix actif du client, pas une surprise.
*/

ALTER TABLE tenants ADD COLUMN IF NOT EXISTS locked_price_usd numeric(10,2);
