/*
# Real payroll module

## Problem
The "Paie" (payroll) feature promised on the Premium plan was a complete
facade: it queried the `customers` table pretending they were employees,
and "generating a payslip" just wrote an audit log line -- no PDF, no
salary calculation, nothing real.

## What this adds
- `employees` -- actual staff records, separate from customers.
- `payroll_settings` -- per-tenant configurable statutory contribution
  rates. Exact CNPS/IPRES/income-tax rates vary significantly across
  OHADA-zone countries and change over time, so these are editable
  defaults the tenant must verify for their own country rather than a
  silently-assumed hard-coded rate.
- `payslips` -- one record per employee per pay period, with the
  computed breakdown stored (so historical payslips don't silently
  change if rates are edited later).
*/

CREATE TABLE IF NOT EXISTS employees (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  full_name       text NOT NULL,
  position        text,
  hire_date       date,
  contract_type   text NOT NULL DEFAULT 'CDI' CHECK (contract_type IN ('CDI', 'CDD', 'Stage', 'Consultant')),
  gross_salary    numeric(15,2) NOT NULL DEFAULT 0,
  bank_details    jsonb NOT NULL DEFAULT '{}'::jsonb,
  is_active       boolean NOT NULL DEFAULT true,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE employees ENABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS idx_employees_tenant ON employees(tenant_id);

DROP TRIGGER IF EXISTS employees_updated_at ON employees;
CREATE TRIGGER employees_updated_at BEFORE UPDATE ON employees
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

DROP POLICY IF EXISTS "emp_all" ON employees;
CREATE POLICY "emp_all" ON employees FOR ALL TO authenticated
  USING (is_tenant_member(tenant_id)) WITH CHECK (is_tenant_member(tenant_id));

CREATE TABLE IF NOT EXISTS payroll_settings (
  tenant_id                uuid PRIMARY KEY REFERENCES tenants(id) ON DELETE CASCADE,
  employee_contribution_pct numeric(5,2) NOT NULL DEFAULT 5.5,  -- e.g. CNPS employee share
  employer_contribution_pct numeric(5,2) NOT NULL DEFAULT 12.0, -- e.g. CNPS employer share (informational, not deducted from net)
  income_tax_pct           numeric(5,2) NOT NULL DEFAULT 10.0,  -- simplified flat estimate; real IRPP is progressive by bracket
  notes                    text DEFAULT 'Taux par défaut à vérifier et ajuster selon la réglementation de votre pays (CNPS/IPRES, barème IRPP).',
  updated_at               timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE payroll_settings ENABLE ROW LEVEL SECURITY;

DROP TRIGGER IF EXISTS payroll_settings_updated_at ON payroll_settings;
CREATE TRIGGER payroll_settings_updated_at BEFORE UPDATE ON payroll_settings
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

DROP POLICY IF EXISTS "ps_select" ON payroll_settings;
CREATE POLICY "ps_select" ON payroll_settings FOR SELECT TO authenticated
  USING (is_tenant_member(tenant_id));
DROP POLICY IF EXISTS "ps_upsert" ON payroll_settings;
CREATE POLICY "ps_upsert" ON payroll_settings FOR INSERT TO authenticated
  WITH CHECK (is_tenant_admin(tenant_id));
DROP POLICY IF EXISTS "ps_update" ON payroll_settings;
CREATE POLICY "ps_update" ON payroll_settings FOR UPDATE TO authenticated
  USING (is_tenant_admin(tenant_id)) WITH CHECK (is_tenant_admin(tenant_id));

CREATE TABLE IF NOT EXISTS payslips (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id             uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  employee_id           uuid NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  period_month          integer NOT NULL CHECK (period_month BETWEEN 1 AND 12),
  period_year           integer NOT NULL CHECK (period_year BETWEEN 2020 AND 2100),
  gross_salary          numeric(15,2) NOT NULL,
  employee_contribution numeric(15,2) NOT NULL,
  income_tax            numeric(15,2) NOT NULL,
  net_salary            numeric(15,2) NOT NULL,
  transaction_id        uuid REFERENCES transactions(id) ON DELETE SET NULL,
  generated_by          uuid REFERENCES auth.users(id),
  created_at            timestamptz NOT NULL DEFAULT now(),
  UNIQUE (employee_id, period_month, period_year)
);

ALTER TABLE payslips ENABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS idx_payslips_tenant ON payslips(tenant_id);

DROP POLICY IF EXISTS "payslips_select" ON payslips;
CREATE POLICY "payslips_select" ON payslips FOR SELECT TO authenticated
  USING (is_tenant_member(tenant_id));
-- No direct INSERT policy: payslips are only ever created by
-- generate_payslip() below, so the accounting entry and the payslip
-- record can never get out of sync with each other.
DROP POLICY IF EXISTS "payslips_delete" ON payslips;
CREATE POLICY "payslips_delete" ON payslips FOR DELETE TO authenticated
  USING (is_tenant_admin(tenant_id));

-- Computes and records one payslip for one employee/period, and books
-- the corresponding salary expense + liability accounting entry
-- (debit 66 Charges de personnel, credit 42 Personnel - rémunérations dues
-- and 43 Organismes sociaux, per SYSCOHADA class 6/4 conventions).
CREATE OR REPLACE FUNCTION generate_payslip(
  p_employee_id uuid,
  p_period_month integer,
  p_period_year integer,
  p_salary_expense_account_id uuid,
  p_net_payable_account_id uuid,
  p_social_payable_account_id uuid
)
RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_employee employees%ROWTYPE;
  v_settings payroll_settings%ROWTYPE;
  v_gross numeric(15,2);
  v_employee_contrib numeric(15,2);
  v_income_tax numeric(15,2);
  v_net numeric(15,2);
  v_tx_id uuid;
  v_payslip_id uuid;
BEGIN
  SELECT * INTO v_employee FROM employees WHERE id = p_employee_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Employee not found'; END IF;

  IF NOT (is_tenant_member(v_employee.tenant_id) OR is_super_admin()) THEN
    RAISE EXCEPTION 'Not authorized for this tenant';
  END IF;

  SELECT * INTO v_settings FROM payroll_settings WHERE tenant_id = v_employee.tenant_id;
  IF NOT FOUND THEN
    INSERT INTO payroll_settings (tenant_id) VALUES (v_employee.tenant_id) RETURNING * INTO v_settings;
  END IF;

  v_gross := v_employee.gross_salary;
  v_employee_contrib := round(v_gross * v_settings.employee_contribution_pct / 100, 2);
  v_income_tax := round(v_gross * v_settings.income_tax_pct / 100, 2);
  v_net := v_gross - v_employee_contrib - v_income_tax;

  INSERT INTO transactions (tenant_id, transaction_date, description, is_posted, created_by)
  VALUES (v_employee.tenant_id, make_date(p_period_year, p_period_month, 1), 'Paie ' || v_employee.full_name || ' - ' || p_period_month || '/' || p_period_year, true, auth.uid())
  RETURNING id INTO v_tx_id;

  INSERT INTO transaction_lines (tenant_id, transaction_id, account_id, debit, credit, description) VALUES
    (v_employee.tenant_id, v_tx_id, p_salary_expense_account_id, v_gross, 0, 'Salaire brut'),
    (v_employee.tenant_id, v_tx_id, p_net_payable_account_id, 0, v_net, 'Net à payer'),
    (v_employee.tenant_id, v_tx_id, p_social_payable_account_id, 0, v_employee_contrib + v_income_tax, 'Retenues salariales');

  INSERT INTO payslips (tenant_id, employee_id, period_month, period_year, gross_salary, employee_contribution, income_tax, net_salary, transaction_id, generated_by)
  VALUES (v_employee.tenant_id, p_employee_id, p_period_month, p_period_year, v_gross, v_employee_contrib, v_income_tax, v_net, v_tx_id, auth.uid())
  RETURNING id INTO v_payslip_id;

  RETURN v_payslip_id;
END;
$$;
REVOKE EXECUTE ON FUNCTION generate_payslip(uuid, integer, integer, uuid, uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION generate_payslip(uuid, integer, integer, uuid, uuid, uuid) TO authenticated;
