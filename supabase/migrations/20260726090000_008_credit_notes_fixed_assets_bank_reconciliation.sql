/*
# Credit Notes, Fixed Assets & Bank Reconciliation

Adds three modules that were missing for an internationally-credible
accounting product:

1. `credit_notes` / `credit_note_items` — legal requirement to correct or
   cancel an already-issued invoice, with automatic ledger posting
   (reversal of revenue + VAT + receivable).
2. `fixed_assets` / `depreciation_entries` — an actual fixed-asset
   register with monthly straight-line depreciation that posts real
   journal entries (previously only a chart-of-accounts line existed,
   with no register or automatic postings).
3. `bank_statement_lines` — real bank reconciliation: import a bank
   statement and match its lines against ledger entries, instead of the
   previous "tick a box" lettrage with nothing to reconcile against.

All new tables follow the exact same tenant-isolation pattern as the rest
of the schema (RLS via is_tenant_member / is_tenant_admin / is_super_admin).
*/

-- ============================================================
-- 1. CREDIT NOTES (avoirs)
-- ============================================================

CREATE TABLE IF NOT EXISTS credit_notes (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id           uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  credit_note_number  text NOT NULL,
  original_invoice_id uuid REFERENCES sales_invoices(id) ON DELETE SET NULL,
  customer_id         uuid NOT NULL REFERENCES customers(id),
  issue_date          date NOT NULL DEFAULT CURRENT_DATE,
  reason              text,
  subtotal            numeric(15,2) NOT NULL DEFAULT 0,
  vat_amount          numeric(15,2) NOT NULL DEFAULT 0,
  total               numeric(15,2) NOT NULL DEFAULT 0,
  currency            text NOT NULL DEFAULT 'XOF',
  exchange_rate       numeric(15,6) NOT NULL DEFAULT 1,
  status              text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'issued', 'applied', 'cancelled')),
  transaction_id      uuid REFERENCES transactions(id) ON DELETE SET NULL,
  created_by          uuid REFERENCES auth.users(id),
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, credit_note_number)
);

CREATE TABLE IF NOT EXISTS credit_note_items (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  credit_note_id  uuid NOT NULL REFERENCES credit_notes(id) ON DELETE CASCADE,
  description     text NOT NULL,
  quantity        numeric(15,3) NOT NULL DEFAULT 1,
  unit_price      numeric(15,2) NOT NULL DEFAULT 0,
  vat_rate        numeric(5,2) NOT NULL DEFAULT 0,
  line_total      numeric(15,2) NOT NULL DEFAULT 0
);

ALTER TABLE credit_notes ENABLE ROW LEVEL SECURITY;
ALTER TABLE credit_note_items ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS idx_cn_tenant ON credit_notes(tenant_id);
CREATE INDEX IF NOT EXISTS idx_cn_invoice ON credit_notes(original_invoice_id);
CREATE INDEX IF NOT EXISTS idx_cni_credit_note ON credit_note_items(credit_note_id);

DROP TRIGGER IF EXISTS credit_notes_updated_at ON credit_notes;
CREATE TRIGGER credit_notes_updated_at
  BEFORE UPDATE ON credit_notes
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- RLS: same tenant-member / tenant-admin pattern as sales_invoices
DROP POLICY IF EXISTS "cn_select" ON credit_notes;
CREATE POLICY "cn_select" ON credit_notes FOR SELECT TO authenticated
  USING (is_tenant_member(tenant_id) OR is_super_admin());
DROP POLICY IF EXISTS "cn_insert" ON credit_notes;
CREATE POLICY "cn_insert" ON credit_notes FOR INSERT TO authenticated
  WITH CHECK (is_tenant_member(tenant_id));
DROP POLICY IF EXISTS "cn_update" ON credit_notes;
CREATE POLICY "cn_update" ON credit_notes FOR UPDATE TO authenticated
  USING (is_tenant_member(tenant_id) AND status != 'applied')
  WITH CHECK (is_tenant_member(tenant_id));
DROP POLICY IF EXISTS "cn_delete" ON credit_notes;
CREATE POLICY "cn_delete" ON credit_notes FOR DELETE TO authenticated
  USING (is_tenant_admin(tenant_id) AND status = 'draft');

DROP POLICY IF EXISTS "cni_select" ON credit_note_items;
CREATE POLICY "cni_select" ON credit_note_items FOR SELECT TO authenticated
  USING (is_tenant_member(tenant_id) OR is_super_admin());
DROP POLICY IF EXISTS "cni_insert" ON credit_note_items;
CREATE POLICY "cni_insert" ON credit_note_items FOR INSERT TO authenticated
  WITH CHECK (is_tenant_member(tenant_id));
DROP POLICY IF EXISTS "cni_update" ON credit_note_items;
CREATE POLICY "cni_update" ON credit_note_items FOR UPDATE TO authenticated
  USING (is_tenant_member(tenant_id)) WITH CHECK (is_tenant_member(tenant_id));
DROP POLICY IF EXISTS "cni_delete" ON credit_note_items;
CREATE POLICY "cni_delete" ON credit_note_items FOR DELETE TO authenticated
  USING (is_tenant_member(tenant_id));

-- Sequential numbering, same pattern/safety as next_invoice_number
CREATE OR REPLACE FUNCTION next_credit_note_number(p_tenant_id uuid)
RETURNS text
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_counter integer;
  v_year text;
BEGIN
  IF NOT (is_tenant_member(p_tenant_id) OR is_super_admin()) THEN
    RAISE EXCEPTION 'Not authorized for this tenant';
  END IF;

  SELECT COUNT(*) + 1 INTO v_counter FROM credit_notes WHERE tenant_id = p_tenant_id;
  v_year := to_char(CURRENT_DATE, 'YYYY');

  RETURN 'AV-' || v_year || '-' || LPAD(v_counter::text, 5, '0');
END;
$$;
REVOKE EXECUTE ON FUNCTION next_credit_note_number(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION next_credit_note_number(uuid) TO authenticated;

-- Posts a credit note to the general ledger:
--   Debit  701 (Ventes)         subtotal
--   Debit  4431 (TVA facturée)  vat_amount
--   Credit 411 (Clients)        total
-- Looks accounts up by code within the tenant's own chart of accounts, so
-- it works regardless of which currency/locale variant is in use.
CREATE OR REPLACE FUNCTION post_credit_note_to_ledger(p_credit_note_id uuid)
RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_cn credit_notes%ROWTYPE;
  v_tx_id uuid;
  v_acc_revenue uuid;
  v_acc_vat uuid;
  v_acc_client uuid;
BEGIN
  SELECT * INTO v_cn FROM credit_notes WHERE id = p_credit_note_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Credit note not found'; END IF;
  IF NOT (is_tenant_member(v_cn.tenant_id) OR is_super_admin()) THEN
    RAISE EXCEPTION 'Not authorized for this tenant';
  END IF;
  IF v_cn.transaction_id IS NOT NULL THEN
    RAISE EXCEPTION 'Credit note already posted';
  END IF;

  SELECT id INTO v_acc_revenue FROM accounts WHERE tenant_id = v_cn.tenant_id AND code = '701' LIMIT 1;
  SELECT id INTO v_acc_vat FROM accounts WHERE tenant_id = v_cn.tenant_id AND code = '4431' LIMIT 1;
  SELECT id INTO v_acc_client FROM accounts WHERE tenant_id = v_cn.tenant_id AND code = '411' LIMIT 1;

  IF v_acc_revenue IS NULL OR v_acc_client IS NULL THEN
    RAISE EXCEPTION 'Chart of accounts is missing required accounts (701/411)';
  END IF;

  INSERT INTO transactions (tenant_id, date, reference, description, source_type, source_id, is_posted, created_by)
  VALUES (v_cn.tenant_id, v_cn.issue_date, v_cn.credit_note_number, 'Avoir ' || v_cn.credit_note_number, 'credit_note', v_cn.id, true, v_cn.created_by)
  RETURNING id INTO v_tx_id;

  INSERT INTO transaction_lines (tenant_id, transaction_id, account_id, description, debit, credit)
  VALUES (v_cn.tenant_id, v_tx_id, v_acc_revenue, 'Annulation vente - ' || v_cn.credit_note_number, v_cn.subtotal, 0);

  IF v_cn.vat_amount > 0 AND v_acc_vat IS NOT NULL THEN
    INSERT INTO transaction_lines (tenant_id, transaction_id, account_id, description, debit, credit)
    VALUES (v_cn.tenant_id, v_tx_id, v_acc_vat, 'Annulation TVA - ' || v_cn.credit_note_number, v_cn.vat_amount, 0);
  END IF;

  INSERT INTO transaction_lines (tenant_id, transaction_id, account_id, description, debit, credit)
  VALUES (v_cn.tenant_id, v_tx_id, v_acc_client, 'Avoir client - ' || v_cn.credit_note_number, 0, v_cn.total);

  UPDATE credit_notes SET transaction_id = v_tx_id, status = 'applied' WHERE id = p_credit_note_id;

  RETURN v_tx_id;
END;
$$;
REVOKE EXECUTE ON FUNCTION post_credit_note_to_ledger(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION post_credit_note_to_ledger(uuid) TO authenticated;

-- ============================================================
-- 2. FIXED ASSETS (immobilisations)
-- ============================================================

CREATE TABLE IF NOT EXISTS fixed_assets (
  id                     uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id              uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  name                   text NOT NULL,
  asset_account_id       uuid NOT NULL REFERENCES accounts(id),
  depreciation_account_id uuid NOT NULL REFERENCES accounts(id),
  expense_account_id     uuid NOT NULL REFERENCES accounts(id),
  acquisition_date       date NOT NULL,
  acquisition_cost       numeric(15,2) NOT NULL CHECK (acquisition_cost > 0),
  residual_value         numeric(15,2) NOT NULL DEFAULT 0,
  useful_life_months     integer NOT NULL CHECK (useful_life_months > 0),
  accumulated_depreciation numeric(15,2) NOT NULL DEFAULT 0,
  status                 text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'fully_depreciated', 'disposed')),
  disposal_date          date,
  created_by             uuid REFERENCES auth.users(id),
  created_at             timestamptz NOT NULL DEFAULT now(),
  updated_at             timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS depreciation_entries (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  fixed_asset_id  uuid NOT NULL REFERENCES fixed_assets(id) ON DELETE CASCADE,
  period_date     date NOT NULL,
  amount          numeric(15,2) NOT NULL,
  transaction_id  uuid REFERENCES transactions(id) ON DELETE SET NULL,
  created_at      timestamptz NOT NULL DEFAULT now(),
  UNIQUE (fixed_asset_id, period_date)
);

ALTER TABLE fixed_assets ENABLE ROW LEVEL SECURITY;
ALTER TABLE depreciation_entries ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS idx_fa_tenant ON fixed_assets(tenant_id);
CREATE INDEX IF NOT EXISTS idx_de_tenant ON depreciation_entries(tenant_id);
CREATE INDEX IF NOT EXISTS idx_de_asset ON depreciation_entries(fixed_asset_id);

DROP TRIGGER IF EXISTS fixed_assets_updated_at ON fixed_assets;
CREATE TRIGGER fixed_assets_updated_at
  BEFORE UPDATE ON fixed_assets
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

DROP POLICY IF EXISTS "fa_select" ON fixed_assets;
CREATE POLICY "fa_select" ON fixed_assets FOR SELECT TO authenticated
  USING (is_tenant_member(tenant_id) OR is_super_admin());
DROP POLICY IF EXISTS "fa_insert" ON fixed_assets;
CREATE POLICY "fa_insert" ON fixed_assets FOR INSERT TO authenticated
  WITH CHECK (is_tenant_member(tenant_id));
DROP POLICY IF EXISTS "fa_update" ON fixed_assets;
CREATE POLICY "fa_update" ON fixed_assets FOR UPDATE TO authenticated
  USING (is_tenant_member(tenant_id)) WITH CHECK (is_tenant_member(tenant_id));
DROP POLICY IF EXISTS "fa_delete" ON fixed_assets;
CREATE POLICY "fa_delete" ON fixed_assets FOR DELETE TO authenticated
  USING (is_tenant_admin(tenant_id) AND accumulated_depreciation = 0);

DROP POLICY IF EXISTS "de_select" ON depreciation_entries;
CREATE POLICY "de_select" ON depreciation_entries FOR SELECT TO authenticated
  USING (is_tenant_member(tenant_id) OR is_super_admin());
DROP POLICY IF EXISTS "de_insert" ON depreciation_entries;
CREATE POLICY "de_insert" ON depreciation_entries FOR INSERT TO authenticated
  WITH CHECK (is_tenant_member(tenant_id));

-- Runs straight-line depreciation for a tenant for a given month (pass the
-- 1st of the month). Safe to re-run: a unique constraint on
-- (fixed_asset_id, period_date) prevents double-posting.
CREATE OR REPLACE FUNCTION run_monthly_depreciation(p_tenant_id uuid, p_period date)
RETURNS TABLE (fixed_asset_id uuid, amount numeric)
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_asset RECORD;
  v_monthly numeric(15,2);
  v_remaining numeric(15,2);
  v_tx_id uuid;
  v_period date := date_trunc('month', p_period)::date;
BEGIN
  IF NOT (is_tenant_admin(p_tenant_id) OR is_super_admin()) THEN
    RAISE EXCEPTION 'Not authorized for this tenant';
  END IF;

  FOR v_asset IN
    SELECT * FROM fixed_assets
    WHERE tenant_id = p_tenant_id
      AND status = 'active'
      AND acquisition_date <= v_period
      AND NOT EXISTS (
        SELECT 1 FROM depreciation_entries d
        WHERE d.fixed_asset_id = fixed_assets.id AND d.period_date = v_period
      )
  LOOP
    v_monthly := ROUND((v_asset.acquisition_cost - v_asset.residual_value) / v_asset.useful_life_months, 2);
    v_remaining := v_asset.acquisition_cost - v_asset.residual_value - v_asset.accumulated_depreciation;
    IF v_remaining <= 0 THEN
      UPDATE fixed_assets SET status = 'fully_depreciated' WHERE id = v_asset.id;
      CONTINUE;
    END IF;
    v_monthly := LEAST(v_monthly, v_remaining);

    INSERT INTO transactions (tenant_id, date, reference, description, source_type, source_id, is_posted)
    VALUES (p_tenant_id, (v_period + interval '1 month' - interval '1 day')::date, 'DOT-' || to_char(v_period, 'YYYYMM'),
            'Dotation amortissement - ' || v_asset.name, 'depreciation', v_asset.id, true)
    RETURNING id INTO v_tx_id;

    INSERT INTO transaction_lines (tenant_id, transaction_id, account_id, description, debit, credit)
    VALUES (p_tenant_id, v_tx_id, v_asset.expense_account_id, 'Dotation - ' || v_asset.name, v_monthly, 0);

    INSERT INTO transaction_lines (tenant_id, transaction_id, account_id, description, debit, credit)
    VALUES (p_tenant_id, v_tx_id, v_asset.depreciation_account_id, 'Amort. cumulé - ' || v_asset.name, 0, v_monthly);

    INSERT INTO depreciation_entries (tenant_id, fixed_asset_id, period_date, amount, transaction_id)
    VALUES (p_tenant_id, v_asset.id, v_period, v_monthly, v_tx_id);

    UPDATE fixed_assets
    SET accumulated_depreciation = accumulated_depreciation + v_monthly,
        status = CASE WHEN accumulated_depreciation + v_monthly >= acquisition_cost - residual_value
                       THEN 'fully_depreciated' ELSE 'active' END
    WHERE id = v_asset.id;

    fixed_asset_id := v_asset.id;
    amount := v_monthly;
    RETURN NEXT;
  END LOOP;
END;
$$;
REVOKE EXECUTE ON FUNCTION run_monthly_depreciation(uuid, date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION run_monthly_depreciation(uuid, date) TO authenticated;

-- ============================================================
-- 3. BANK RECONCILIATION
-- ============================================================

CREATE TABLE IF NOT EXISTS bank_statement_lines (
  id                       uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id                uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  account_id               uuid NOT NULL REFERENCES accounts(id),
  statement_date           date NOT NULL,
  description              text NOT NULL,
  amount                   numeric(15,2) NOT NULL, -- positive = credit (deposit), negative = debit (withdrawal)
  reference                text,
  status                   text NOT NULL DEFAULT 'unmatched' CHECK (status IN ('unmatched', 'matched', 'ignored')),
  matched_transaction_line_id uuid REFERENCES transaction_lines(id) ON DELETE SET NULL,
  imported_by              uuid REFERENCES auth.users(id),
  created_at               timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE bank_statement_lines ENABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS idx_bsl_tenant ON bank_statement_lines(tenant_id);
CREATE INDEX IF NOT EXISTS idx_bsl_account ON bank_statement_lines(account_id);
CREATE INDEX IF NOT EXISTS idx_bsl_status ON bank_statement_lines(tenant_id, status);

DROP POLICY IF EXISTS "bsl_select" ON bank_statement_lines;
CREATE POLICY "bsl_select" ON bank_statement_lines FOR SELECT TO authenticated
  USING (is_tenant_member(tenant_id) OR is_super_admin());
DROP POLICY IF EXISTS "bsl_insert" ON bank_statement_lines;
CREATE POLICY "bsl_insert" ON bank_statement_lines FOR INSERT TO authenticated
  WITH CHECK (is_tenant_member(tenant_id));
DROP POLICY IF EXISTS "bsl_update" ON bank_statement_lines;
CREATE POLICY "bsl_update" ON bank_statement_lines FOR UPDATE TO authenticated
  USING (is_tenant_member(tenant_id)) WITH CHECK (is_tenant_member(tenant_id));
DROP POLICY IF EXISTS "bsl_delete" ON bank_statement_lines;
CREATE POLICY "bsl_delete" ON bank_statement_lines FOR DELETE TO authenticated
  USING (is_tenant_admin(tenant_id) AND status != 'matched');

-- Link back from a ledger line to the bank statement line it was matched to.
ALTER TABLE transaction_lines ADD COLUMN IF NOT EXISTS bank_statement_line_id uuid REFERENCES bank_statement_lines(id) ON DELETE SET NULL;

-- Matches a bank statement line to a ledger transaction line: marks both
-- as reconciled/matched, atomically, after checking amounts correspond.
CREATE OR REPLACE FUNCTION match_bank_statement_line(p_statement_line_id uuid, p_transaction_line_id uuid)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_stmt bank_statement_lines%ROWTYPE;
  v_line transaction_lines%ROWTYPE;
  v_line_amount numeric(15,2);
BEGIN
  SELECT * INTO v_stmt FROM bank_statement_lines WHERE id = p_statement_line_id FOR UPDATE;
  SELECT * INTO v_line FROM transaction_lines WHERE id = p_transaction_line_id FOR UPDATE;

  IF NOT FOUND OR v_stmt.id IS NULL THEN
    RAISE EXCEPTION 'Statement line or transaction line not found';
  END IF;
  IF v_stmt.tenant_id <> v_line.tenant_id THEN
    RAISE EXCEPTION 'Tenant mismatch';
  END IF;
  IF NOT (is_tenant_member(v_stmt.tenant_id) OR is_super_admin()) THEN
    RAISE EXCEPTION 'Not authorized for this tenant';
  END IF;

  v_line_amount := v_line.debit - v_line.credit;
  IF ROUND(v_line_amount, 2) <> ROUND(v_stmt.amount, 2) THEN
    RAISE EXCEPTION 'Amount mismatch: statement % vs ledger %', v_stmt.amount, v_line_amount;
  END IF;

  UPDATE bank_statement_lines SET status = 'matched', matched_transaction_line_id = p_transaction_line_id WHERE id = p_statement_line_id;
  UPDATE transaction_lines SET reconciled = true, bank_statement_line_id = p_statement_line_id WHERE id = p_transaction_line_id;
END;
$$;
REVOKE EXECUTE ON FUNCTION match_bank_statement_line(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION match_bank_statement_line(uuid, uuid) TO authenticated;
