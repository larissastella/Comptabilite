/*
# Flutterwave billing columns

Mirrors the existing stripe_customer_id / stripe_subscription_id columns
so a tenant can be billed via either provider — useful since Stripe
covers cards well internationally but Flutterwave covers Mobile Money
and local African payment rails that Stripe doesn't.
*/

ALTER TABLE tenants ADD COLUMN IF NOT EXISTS flutterwave_customer_id text;
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS flutterwave_last_tx_ref text;
