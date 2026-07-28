/*
# Multi-currency: FX rates + realized gain/loss

## Problem
Invoices had a `currency` and `exchange_rate` field, but there was no rate
table, no historical rates, and no way to record a gain/loss when an
invoice is paid at a different rate than it was issued at.

## What this adds
1. `fx_rates` — daily rates per tenant (falls back to a shared platform
   default rate super admins maintain, so a small tenant doesn't have to
   enter rates manually every day).
2. `get_fx_rate()` — resolves the best available rate for a currency pair
   on/near a given date (tenant override first, else platform default).
3. `fx_realized_gains` — one row per payment recording the realized
   gain/loss between invoice-date rate and payment-date rate, and the
   accounting entry that books it to account 676/776 (SYSCOHADA: pertes
   / gains de change).
*/

CREATE TABLE IF NOT EXISTS fx_rates (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id      uuid REFERENCES tenants(id) ON DELETE CASCADE, -- NULL = platform-wide default rate
  currency_from  text NOT NULL,
  currency_to    text NOT NULL,
  rate           numeric(18,6) NOT NULL CHECK (rate > 0),
  rate_date      date NOT NULL DEFAULT CURRENT_DATE,
  source         text NOT NULL DEFAULT 'manual' CHECK (source IN ('manual', 'platform_default', 'api')),
  created_by     uuid REFERENCES auth.users(id),
  created_at     timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, currency_from, currency_to, rate_date)
);

ALTER TABLE fx_rates ENABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS idx_fx_rates_lookup ON fx_rates(currency_from, currency_to, rate_date DESC);

DROP POLICY IF EXISTS "fx_select" ON fx_rates;
CREATE POLICY "fx_select" ON fx_rates FOR SELECT TO authenticated
  USING (tenant_id IS NULL OR is_tenant_member(tenant_id) OR is_super_admin());
DROP POLICY IF EXISTS "fx_insert" ON fx_rates;
CREATE POLICY "fx_insert" ON fx_rates FOR INSERT TO authenticated
  WITH CHECK (
    (tenant_id IS NOT NULL AND is_tenant_admin(tenant_id))
    OR (tenant_id IS NULL AND is_super_admin())
  );
DROP POLICY IF EXISTS "fx_delete" ON fx_rates;
CREATE POLICY "fx_delete" ON fx_rates FOR DELETE TO authenticated
  USING (
    (tenant_id IS NOT NULL AND is_tenant_admin(tenant_id))
    OR (tenant_id IS NULL AND is_super_admin())
  );

-- Resolve the best rate for a currency pair on/before a given date:
-- tenant-specific rate first, falling back to the platform default.
CREATE OR REPLACE FUNCTION get_fx_rate(p_tenant_id uuid, p_from text, p_to text, p_date date DEFAULT CURRENT_DATE)
RETURNS numeric
LANGUAGE plpgsql STABLE
SET search_path = public
AS $$
DECLARE
  v_rate numeric;
BEGIN
  IF p_from = p_to THEN RETURN 1; END IF;

  SELECT rate INTO v_rate FROM fx_rates
  WHERE tenant_id = p_tenant_id AND currency_from = p_from AND currency_to = p_to AND rate_date <= p_date
  ORDER BY rate_date DESC LIMIT 1;
  IF v_rate IS NOT NULL THEN RETURN v_rate; END IF;

  SELECT rate INTO v_rate FROM fx_rates
  WHERE tenant_id IS NULL AND currency_from = p_from AND currency_to = p_to AND rate_date <= p_date
  ORDER BY rate_date DESC LIMIT 1;
  IF v_rate IS NOT NULL THEN RETURN v_rate; END IF;

  -- Try the inverse pair and flip it, rather than failing outright.
  SELECT rate INTO v_rate FROM fx_rates
  WHERE (tenant_id = p_tenant_id OR tenant_id IS NULL) AND currency_from = p_to AND currency_to = p_from AND rate_date <= p_date
  ORDER BY tenant_id NULLS LAST, rate_date DESC LIMIT 1;
  IF v_rate IS NOT NULL AND v_rate > 0 THEN RETURN 1 / v_rate; END IF;

  RETURN NULL; -- caller must handle "no rate available"
END;
$$;
REVOKE EXECUTE ON FUNCTION get_fx_rate(uuid, text, text, date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION get_fx_rate(uuid, text, text, date) TO authenticated;

-- Realized FX gain/loss, recorded when a foreign-currency invoice is
-- settled at a rate different from the one it was issued at.
CREATE TABLE IF NOT EXISTS fx_realized_gains (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id          uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  sales_invoice_id   uuid REFERENCES sales_invoices(id) ON DELETE SET NULL,
  purchase_invoice_id uuid REFERENCES purchase_invoices(id) ON DELETE SET NULL,
  invoice_currency   text NOT NULL,
  base_currency      text NOT NULL,
  invoice_rate       numeric(18,6) NOT NULL,
  settlement_rate    numeric(18,6) NOT NULL,
  invoice_amount     numeric(15,2) NOT NULL,
  gain_loss_amount   numeric(15,2) NOT NULL, -- positive = gain, negative = loss, in base currency
  transaction_id     uuid REFERENCES transactions(id) ON DELETE SET NULL,
  created_at         timestamptz NOT NULL DEFAULT now(),
  CHECK (sales_invoice_id IS NOT NULL OR purchase_invoice_id IS NOT NULL)
);

ALTER TABLE fx_realized_gains ENABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS idx_fxrg_tenant ON fx_realized_gains(tenant_id);

DROP POLICY IF EXISTS "fxrg_select" ON fx_realized_gains;
CREATE POLICY "fxrg_select" ON fx_realized_gains FOR SELECT TO authenticated
  USING (is_tenant_member(tenant_id) OR is_super_admin());
DROP POLICY IF EXISTS "fxrg_insert" ON fx_realized_gains;
CREATE POLICY "fxrg_insert" ON fx_realized_gains FOR INSERT TO authenticated
  WITH CHECK (is_tenant_member(tenant_id) OR is_super_admin());

-- Records a realized FX gain/loss and books the corresponding double-entry
-- line to account 776 (Gains de change) or 676 (Pertes de change).
CREATE OR REPLACE FUNCTION record_fx_settlement(
  p_tenant_id uuid,
  p_sales_invoice_id uuid,
  p_purchase_invoice_id uuid,
  p_invoice_currency text,
  p_base_currency text,
  p_invoice_rate numeric,
  p_settlement_rate numeric,
  p_invoice_amount numeric,
  p_fx_account_id uuid,
  p_counterpart_account_id uuid
)
RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_gain_loss numeric;
  v_tx_id uuid;
  v_abs numeric;
BEGIN
  IF NOT (is_tenant_member(p_tenant_id) OR is_super_admin()) THEN
    RAISE EXCEPTION 'Not authorized for this tenant';
  END IF;

  v_gain_loss := round(p_invoice_amount * (p_settlement_rate - p_invoice_rate), 2);
  IF v_gain_loss = 0 THEN
    INSERT INTO fx_realized_gains (tenant_id, sales_invoice_id, purchase_invoice_id, invoice_currency, base_currency, invoice_rate, settlement_rate, invoice_amount, gain_loss_amount)
    VALUES (p_tenant_id, p_sales_invoice_id, p_purchase_invoice_id, p_invoice_currency, p_base_currency, p_invoice_rate, p_settlement_rate, p_invoice_amount, 0);
    RETURN NULL;
  END IF;

  v_abs := abs(v_gain_loss);

  INSERT INTO transactions (tenant_id, transaction_date, description, is_posted, created_by)
  VALUES (p_tenant_id, CURRENT_DATE, 'Écart de change réalisé', true, auth.uid())
  RETURNING id INTO v_tx_id;

  IF v_gain_loss > 0 THEN
    -- Gain: debit counterpart (cash/receivable), credit 776
    INSERT INTO transaction_lines (tenant_id, transaction_id, account_id, debit, credit, description)
    VALUES (p_tenant_id, v_tx_id, p_counterpart_account_id, v_abs, 0, 'Écart de change - gain');
    INSERT INTO transaction_lines (tenant_id, transaction_id, account_id, debit, credit, description)
    VALUES (p_tenant_id, v_tx_id, p_fx_account_id, 0, v_abs, 'Gain de change (776)');
  ELSE
    -- Loss: debit 676, credit counterpart
    INSERT INTO transaction_lines (tenant_id, transaction_id, account_id, debit, credit, description)
    VALUES (p_tenant_id, v_tx_id, p_fx_account_id, v_abs, 0, 'Perte de change (676)');
    INSERT INTO transaction_lines (tenant_id, transaction_id, account_id, debit, credit, description)
    VALUES (p_tenant_id, v_tx_id, p_counterpart_account_id, 0, v_abs, 'Écart de change - perte');
  END IF;

  INSERT INTO fx_realized_gains (tenant_id, sales_invoice_id, purchase_invoice_id, invoice_currency, base_currency, invoice_rate, settlement_rate, invoice_amount, gain_loss_amount, transaction_id)
  VALUES (p_tenant_id, p_sales_invoice_id, p_purchase_invoice_id, p_invoice_currency, p_base_currency, p_invoice_rate, p_settlement_rate, p_invoice_amount, v_gain_loss, v_tx_id);

  RETURN v_tx_id;
END;
$$;
REVOKE EXECUTE ON FUNCTION record_fx_settlement(uuid, uuid, uuid, text, text, numeric, numeric, numeric, uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION record_fx_settlement(uuid, uuid, uuid, text, text, numeric, numeric, numeric, uuid, uuid) TO authenticated;

-- Seed a few common African-corridor reference rates so tenants aren't
-- starting from zero. These are illustrative starting points, not live
-- rates — a real feed (e.g. an FX API) should update `platform_default`
-- rows periodically; see the accompanying edge function.
INSERT INTO fx_rates (tenant_id, currency_from, currency_to, rate, rate_date, source) VALUES
  (NULL, 'USD', 'XAF', 610, CURRENT_DATE, 'platform_default'),
  (NULL, 'EUR', 'XAF', 655.96, CURRENT_DATE, 'platform_default'),
  (NULL, 'USD', 'XOF', 610, CURRENT_DATE, 'platform_default'),
  (NULL, 'EUR', 'XOF', 655.96, CURRENT_DATE, 'platform_default'),
  (NULL, 'USD', 'NGN', 1550, CURRENT_DATE, 'platform_default'),
  (NULL, 'USD', 'KES', 129, CURRENT_DATE, 'platform_default'),
  (NULL, 'USD', 'GHS', 15.3, CURRENT_DATE, 'platform_default'),
  (NULL, 'USD', 'MAD', 9.4, CURRENT_DATE, 'platform_default'),
  (NULL, 'USD', 'AED', 3.6725, CURRENT_DATE, 'platform_default')
ON CONFLICT (tenant_id, currency_from, currency_to, rate_date) DO NOTHING;
