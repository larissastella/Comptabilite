/*
# PayUnit transactions — audit trail + verification anchor

PayUnit's checkout is a hosted redirect (not a client-side widget like
Flutterwave's inline mode), so the amount is set server-side at
`payunit-checkout` time and never travels through client-editable JS —
no amount-tampering surface like the one fixed for Flutterwave. Still
need somewhere to record "this transaction_id was issued for this
tenant/plan" so payunit-verify (sync, on return) and payunit-webhook
(async, notify_url) can both confirm a PayUnit transaction actually
belongs to the tenant they're about to activate a plan for, and to keep
a real payment history instead of just overwriting one "last tx" column.
*/

CREATE TABLE IF NOT EXISTS payunit_transactions (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  transaction_id  text UNIQUE NOT NULL,
  tenant_id       uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  plan            text NOT NULL,
  expected_amount numeric(15,2) NOT NULL,
  currency        text NOT NULL DEFAULT 'XAF',
  status          text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'success', 'failed', 'cancelled')),
  created_at      timestamptz NOT NULL DEFAULT now(),
  confirmed_at    timestamptz
);

CREATE INDEX IF NOT EXISTS idx_payunit_tx_tenant ON payunit_transactions(tenant_id);

ALTER TABLE payunit_transactions ENABLE ROW LEVEL SECURITY;

-- Tenant members can see their own tenant's payment history (read-only —
-- only the edge functions, via the service role, ever write here).
DROP POLICY IF EXISTS "payunit_tx_select" ON payunit_transactions;
CREATE POLICY "payunit_tx_select" ON payunit_transactions FOR SELECT TO authenticated
  USING (is_tenant_member(tenant_id) OR is_super_admin());
