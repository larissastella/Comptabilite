/*
# Paddle transactions — audit trail + verification anchor

Same pattern as payunit_transactions (024) and paystack_transactions (033),
adapted to Paddle Billing v2: checkout happens client-side via Paddle.js
(an overlay, not a hosted redirect or a server-created session), so the
customData the browser attaches to the checkout (tenant_id, plan,
checkout_ref) is technically editable client-side before it reaches Paddle.

paddle-init issues and stores a random checkout_ref server-side BEFORE the
widget opens, tied to the authenticated admin's own tenant/plan/expected
amount. paddle-webhook (the only place a plan is ever actually activated —
never the client's word that checkout "succeeded") requires the event's
customData.checkout_ref to match a still-pending row here for the claimed
tenant_id, and cross-checks the amount actually paid, before activating
anything. This closes the same amount/tenant-tampering class of issue
fixed for Flutterwave (017) for a 5th, client-initiated PSP.
*/

CREATE TABLE IF NOT EXISTS paddle_transactions (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  checkout_ref    text UNIQUE NOT NULL,
  tenant_id       uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  plan            text NOT NULL,
  expected_amount numeric(15,2) NOT NULL,
  currency        text NOT NULL DEFAULT 'USD',
  status          text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'success', 'failed')),
  paddle_transaction_id text,
  created_at      timestamptz NOT NULL DEFAULT now(),
  confirmed_at    timestamptz
);

CREATE INDEX IF NOT EXISTS idx_paddle_tx_tenant ON paddle_transactions(tenant_id);

ALTER TABLE paddle_transactions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "paddle_tx_select" ON paddle_transactions;
CREATE POLICY "paddle_tx_select" ON paddle_transactions FOR SELECT TO authenticated
  USING (is_tenant_member(tenant_id) OR is_super_admin());

ALTER TABLE tenants ADD COLUMN IF NOT EXISTS paddle_customer_id text;
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS paddle_subscription_id text;
