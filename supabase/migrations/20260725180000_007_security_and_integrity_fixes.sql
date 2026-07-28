/*
# Security & Integrity Fixes

## Overview
Fixes five issues found during a security/completeness review:

1. `tenants` INSERT policy was `WITH CHECK (true)` — any authenticated user
   could insert a tenant row directly, bypassing `create_tenant_with_owner`
   (and its "one tenant per user" rule), leading to orphaned/spam tenants.
2. `audit_logs` INSERT policy was `WITH CHECK (true)` with no ownership
   check — any authenticated user could forge audit entries under any
   `user_id` / `tenant_id`, defeating the purpose of an audit trail.
3. `next_invoice_number(p_tenant_id)` never verified that the caller was a
   member of `p_tenant_id`, and had no REVOKE — any authenticated user could
   pass another tenant's id and burn/disrupt its invoice sequence.
4. No enforcement that a transaction's total debits equal its total
   credits — the schema only guaranteed a single line couldn't be both
   debit and credit, so unbalanced journal entries were possible.
5. Posted transactions (`is_posted = true`) could still be edited or
   deleted by any tenant member — no immutability once posted.

## Tables/functions affected
- `tenants` (policy only)
- `audit_logs` (policy only)
- `next_invoice_number` (function body + grants)
- `transactions`, `transaction_lines` (new trigger + tightened policies)
*/

-- ============================================================
-- 1. Lock down direct INSERT into tenants
-- ============================================================
-- Onboarding must go through create_tenant_with_owner(), which is
-- SECURITY DEFINER and already enforces "one tenant per user". Only
-- super admins may insert a tenant row directly (e.g. for support/testing).
DROP POLICY IF EXISTS "tenant_insert" ON tenants;
CREATE POLICY "tenant_insert" ON tenants FOR INSERT
TO authenticated
WITH CHECK (is_super_admin());

-- ============================================================
-- 2. Lock down audit_logs INSERT
-- ============================================================
-- A user can only ever write an audit entry as themselves, and only for a
-- tenant they belong to (or with a NULL tenant_id for platform-level events).
DROP POLICY IF EXISTS "al_insert" ON audit_logs;
CREATE POLICY "al_insert" ON audit_logs FOR INSERT
TO authenticated
WITH CHECK (
  user_id = auth.uid()
  AND (tenant_id IS NULL OR is_tenant_member(tenant_id) OR is_super_admin())
);

-- ============================================================
-- 3. Fix next_invoice_number: enforce tenant membership
-- ============================================================
CREATE OR REPLACE FUNCTION next_invoice_number(p_tenant_id uuid)
RETURNS text
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_prefix text;
  v_counter integer;
  v_year text;
BEGIN
  IF NOT (is_tenant_member(p_tenant_id) OR is_super_admin()) THEN
    RAISE EXCEPTION 'Not authorized for this tenant';
  END IF;

  SELECT invoice_prefix, invoice_counter INTO v_prefix, v_counter
  FROM tenants WHERE id = p_tenant_id FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Tenant not found';
  END IF;

  v_counter := v_counter + 1;
  v_year := to_char(CURRENT_DATE, 'YYYY');

  UPDATE tenants SET invoice_counter = v_counter WHERE id = p_tenant_id;

  RETURN v_prefix || '-' || v_year || '-' || LPAD(v_counter::text, 5, '0');
END;
$$;

REVOKE EXECUTE ON FUNCTION next_invoice_number(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION next_invoice_number(uuid) TO authenticated;

-- ============================================================
-- 4. Enforce balanced double-entry transactions
-- ============================================================
-- Deferred constraint trigger: at COMMIT (or end of statement), every
-- transaction touched must have SUM(debit) = SUM(credit) across its lines.
-- Deferred so multiple line inserts within one DB transaction are allowed
-- before the check runs.
CREATE OR REPLACE FUNCTION check_transaction_balance()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  v_transaction_id uuid;
  v_debit numeric(15,2);
  v_credit numeric(15,2);
BEGIN
  v_transaction_id := COALESCE(NEW.transaction_id, OLD.transaction_id);

  SELECT COALESCE(SUM(debit), 0), COALESCE(SUM(credit), 0)
  INTO v_debit, v_credit
  FROM transaction_lines
  WHERE transaction_id = v_transaction_id;

  IF v_debit <> v_credit THEN
    RAISE EXCEPTION 'Unbalanced transaction %: total debit % <> total credit %',
      v_transaction_id, v_debit, v_credit;
  END IF;

  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS trg_check_transaction_balance ON transaction_lines;
CREATE CONSTRAINT TRIGGER trg_check_transaction_balance
  AFTER INSERT OR UPDATE OR DELETE ON transaction_lines
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW EXECUTE FUNCTION check_transaction_balance();

-- A transaction must have at least one line balanced at zero-zero only if
-- it has no lines at all; disallow marking a transaction as posted when it
-- has zero lines (an empty "balanced" transaction is meaningless).
CREATE OR REPLACE FUNCTION check_posted_transaction_has_lines()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.is_posted AND NOT EXISTS (
    SELECT 1 FROM transaction_lines WHERE transaction_id = NEW.id
  ) THEN
    RAISE EXCEPTION 'Cannot post an empty transaction (no lines)';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_check_posted_has_lines ON transactions;
CREATE CONSTRAINT TRIGGER trg_check_posted_has_lines
  AFTER INSERT OR UPDATE ON transactions
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW EXECUTE FUNCTION check_posted_transaction_has_lines();

-- ============================================================
-- 5. Make posted transactions immutable
-- ============================================================
-- Once is_posted = true, the transaction (and its lines) can no longer be
-- edited or deleted by regular tenant members — only a super admin can,
-- for exceptional corrections. Everyone else must reverse via a new entry.

DROP POLICY IF EXISTS "tx_update" ON transactions;
CREATE POLICY "tx_update" ON transactions FOR UPDATE
TO authenticated
USING (is_tenant_member(tenant_id) AND (NOT is_posted OR is_super_admin()))
WITH CHECK (is_tenant_member(tenant_id));

DROP POLICY IF EXISTS "tx_delete" ON transactions;
CREATE POLICY "tx_delete" ON transactions FOR DELETE
TO authenticated
USING (is_tenant_admin(tenant_id) AND (NOT is_posted OR is_super_admin()));

DROP POLICY IF EXISTS "tl_insert" ON transaction_lines;
CREATE POLICY "tl_insert" ON transaction_lines FOR INSERT
TO authenticated
WITH CHECK (
  is_tenant_member(tenant_id)
  AND (
    is_super_admin()
    OR EXISTS (
      SELECT 1 FROM transactions t
      WHERE t.id = transaction_lines.transaction_id AND NOT t.is_posted
    )
  )
);

DROP POLICY IF EXISTS "tl_update" ON transaction_lines;
CREATE POLICY "tl_update" ON transaction_lines FOR UPDATE
TO authenticated
USING (
  is_tenant_member(tenant_id)
  AND (
    is_super_admin()
    OR EXISTS (
      SELECT 1 FROM transactions t
      WHERE t.id = transaction_lines.transaction_id AND NOT t.is_posted
    )
  )
)
WITH CHECK (is_tenant_member(tenant_id));

DROP POLICY IF EXISTS "tl_delete" ON transaction_lines;
CREATE POLICY "tl_delete" ON transaction_lines FOR DELETE
TO authenticated
USING (
  is_tenant_admin(tenant_id)
  AND (
    is_super_admin()
    OR EXISTS (
      SELECT 1 FROM transactions t
      WHERE t.id = transaction_lines.transaction_id AND NOT t.is_posted
    )
  )
);
