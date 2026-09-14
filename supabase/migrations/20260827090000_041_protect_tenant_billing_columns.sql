/*
# Ferme un vrai contournement de paiement

La policy RLS "tenant_update" autorise tout admin de tenant à modifier
N'IMPORTE QUELLE colonne de sa propre ligne tenants, sans restriction —
y compris plan, subscription_status, locked_price_usd, auto_renew,
next_billing_date, etc. RLS ne fait de la sécurité qu'au niveau ligne,
pas colonne : rien n'empêchait un client authentifié d'appeler
supabase.from('tenants').update({ plan: 'enterprise', subscription_status: 'active' })
sur son propre tenant et de s'auto-passer en payant sans jamais passer
par un PSP.

Testé en conditions réelles avant/après ce correctif (simulation d'un
appel avec le rôle "authenticated") : avant, la mise à jour passait ;
après, elle est silencieusement ignorée pour les colonnes protégées,
sans erreur pour le client (comportement volontaire — un blocage
explicite révélerait à un attaquant exactement quelle colonne est
protégée).

Cette fonction + trigger BEFORE UPDATE reverrouille les colonnes
liées à la facturation à leur valeur précédente pour toute requête qui
n'utilise pas le service_role (donc jamais pour les 5 fonctions Edge de
paiement, qui utilisent SUPABASE_SERVICE_ROLE_KEY et continuent de
fonctionner normalement — vérifié aussi — seulement pour un appel direct
fait avec le JWT d'un utilisateur authentifié).
*/

CREATE OR REPLACE FUNCTION public.protect_tenant_billing_columns()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF auth.role() IS DISTINCT FROM 'service_role' THEN
    NEW.plan := OLD.plan;
    NEW.subscription_status := OLD.subscription_status;
    NEW.trial_ends_at := OLD.trial_ends_at;
    NEW.stripe_customer_id := OLD.stripe_customer_id;
    NEW.stripe_subscription_id := OLD.stripe_subscription_id;
    NEW.referred_by_staff_code := OLD.referred_by_staff_code;
    NEW.max_users := OLD.max_users;
    NEW.flutterwave_customer_id := OLD.flutterwave_customer_id;
    NEW.flutterwave_last_tx_ref := OLD.flutterwave_last_tx_ref;
    NEW.flutterwave_card_token := OLD.flutterwave_card_token;
    NEW.auto_renew := OLD.auto_renew;
    NEW.next_billing_date := OLD.next_billing_date;
    NEW.locked_price_usd := OLD.locked_price_usd;
    NEW.paddle_customer_id := OLD.paddle_customer_id;
    NEW.paddle_subscription_id := OLD.paddle_subscription_id;
    NEW.billing_cycle := OLD.billing_cycle;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_protect_tenant_billing_columns ON tenants;
CREATE TRIGGER trg_protect_tenant_billing_columns
  BEFORE UPDATE ON tenants
  FOR EACH ROW
  EXECUTE FUNCTION public.protect_tenant_billing_columns();
