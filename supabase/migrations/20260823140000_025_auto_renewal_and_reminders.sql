/*
# Auto-renewal (Flutterwave card tokenization) + expiry reminder emails

## What this adds
- `tenants.flutterwave_card_token` / `auto_renew` / `next_billing_date`:
  when a tenant pays by CARD via Flutterwave, Flutterwave returns a
  reusable card token in the charge-verify response. We store it and flip
  `auto_renew = true` so `flutterwave-auto-renew` (a scheduled function)
  can charge it automatically each cycle — no manual repayment needed.
  Mobile Money charges have no such token (by design — MoMo requires
  the customer's live authorization each time), so those stay manual
  with a reminder email instead. Same for PayUnit: no tokenized/recurring
  charge capability is documented for it, so PayUnit-paid tenants are
  always manual-renewal + reminder, same as Mobile Money.
- `billing_reminders_sent`: idempotency guard so the daily reminder cron
  doesn't email a tenant twice for the same expiry date if it runs more
  than once, or a status changes between runs.

Nothing here changes existing behaviour for tenants who haven't paid via
a Flutterwave card since this shipped — `auto_renew` defaults to false.
*/

ALTER TABLE tenants ADD COLUMN IF NOT EXISTS flutterwave_card_token text;
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS auto_renew boolean NOT NULL DEFAULT false;
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS next_billing_date date;

CREATE TABLE IF NOT EXISTS billing_reminders_sent (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id    uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  kind         text NOT NULL CHECK (kind IN ('trial_ending', 'renewal_upcoming', 'payment_failed')),
  for_date     date NOT NULL,
  sent_at      timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, kind, for_date)
);

ALTER TABLE billing_reminders_sent ENABLE ROW LEVEL SECURITY;
-- Only the service role (cron functions) ever reads/writes this table —
-- it's bookkeeping for the reminder job, not tenant-facing data.
DROP POLICY IF EXISTS "billing_reminders_no_client_access" ON billing_reminders_sent;
CREATE POLICY "billing_reminders_no_client_access" ON billing_reminders_sent FOR ALL TO authenticated
  USING (is_super_admin()) WITH CHECK (is_super_admin());
