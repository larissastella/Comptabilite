/*
# Paystack transactions — audit trail + verification anchor

Same pattern as payunit_transactions (migration 024): Paystack's checkout
is also a hosted redirect (authorization_url) set up server-side, so the
amount never travels through client-editable JS. This table records
exactly what paystack-checkout initiated, so paystack-verify (sync, on
callback_url return) and paystack-webhook (async, charge.success event)
can both confirm a transaction really belongs to the tenant/plan it's
about to activate — never trust the callback URL or webhook payload
alone for that.
*/

CREATE TABLE IF NOT EXISTS paystack_transactions (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  reference       text UNIQUE NOT NULL,
  tenant_id       uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  plan            text NOT NULL,
  expected_amount numeric(15,2) NOT NULL, -- in the currency's main unit (e.g. dollars, not cents)
  currency        text NOT NULL DEFAULT 'USD',
  status          text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'success', 'failed', 'abandoned')),
  created_at      timestamptz NOT NULL DEFAULT now(),
  confirmed_at    timestamptz
);

CREATE INDEX IF NOT EXISTS idx_paystack_tx_tenant ON paystack_transactions(tenant_id);

ALTER TABLE paystack_transactions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "paystack_tx_select" ON paystack_transactions;
CREATE POLICY "paystack_tx_select" ON paystack_transactions FOR SELECT TO authenticated
  USING (is_tenant_member(tenant_id) OR is_super_admin());
