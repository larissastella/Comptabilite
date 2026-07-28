/*
# Recurring invoices

Lets a tenant define a template (customer, line items, frequency) that
automatically generates a new draft sales invoice on schedule, instead of
re-creating the same invoice by hand every month.

## Tables
- `recurring_invoice_templates` — the recurring definition.
- `recurring_invoice_template_items` — its line items (mirrors
  sales_invoice_items).

## Function
- `generate_due_recurring_invoices()` — SECURITY DEFINER, meant to be
  called on a schedule (e.g. a daily Supabase Cron job / pg_cron, or an
  edge function hit by an external scheduler). It finds every active
  template whose `next_run_date` has arrived, creates a draft
  sales_invoice + items from it, and advances `next_run_date` per the
  template's frequency. Safe to call as often as you like — it only acts
  on templates that are actually due.
*/

CREATE TABLE IF NOT EXISTS recurring_invoice_templates (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  customer_id     uuid REFERENCES customers(id),
  warehouse_id    uuid REFERENCES warehouses(id),
  label           text NOT NULL,
  frequency       text NOT NULL CHECK (frequency IN ('weekly', 'monthly', 'quarterly', 'yearly')),
  currency        text NOT NULL DEFAULT 'XAF',
  vat_rate        numeric(5,2) NOT NULL DEFAULT 0,
  notes           text,
  terms           text,
  payment_method  text,
  due_in_days     integer NOT NULL DEFAULT 30,
  next_run_date   date NOT NULL DEFAULT CURRENT_DATE,
  end_date        date, -- NULL = runs indefinitely until cancelled
  is_active       boolean NOT NULL DEFAULT true,
  last_generated_invoice_id uuid REFERENCES sales_invoices(id) ON DELETE SET NULL,
  created_by      uuid REFERENCES auth.users(id),
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE recurring_invoice_templates ENABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS idx_rit_tenant ON recurring_invoice_templates(tenant_id);
CREATE INDEX IF NOT EXISTS idx_rit_due ON recurring_invoice_templates(next_run_date) WHERE is_active;

DROP TRIGGER IF EXISTS rit_updated_at ON recurring_invoice_templates;
CREATE TRIGGER rit_updated_at BEFORE UPDATE ON recurring_invoice_templates
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

DROP POLICY IF EXISTS "rit_select" ON recurring_invoice_templates;
CREATE POLICY "rit_select" ON recurring_invoice_templates FOR SELECT TO authenticated
  USING (is_tenant_member(tenant_id) OR is_super_admin());
DROP POLICY IF EXISTS "rit_insert" ON recurring_invoice_templates;
CREATE POLICY "rit_insert" ON recurring_invoice_templates FOR INSERT TO authenticated
  WITH CHECK (is_tenant_member(tenant_id));
DROP POLICY IF EXISTS "rit_update" ON recurring_invoice_templates;
CREATE POLICY "rit_update" ON recurring_invoice_templates FOR UPDATE TO authenticated
  USING (is_tenant_member(tenant_id)) WITH CHECK (is_tenant_member(tenant_id));
DROP POLICY IF EXISTS "rit_delete" ON recurring_invoice_templates;
CREATE POLICY "rit_delete" ON recurring_invoice_templates FOR DELETE TO authenticated
  USING (is_tenant_admin(tenant_id));

CREATE TABLE IF NOT EXISTS recurring_invoice_template_items (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  template_id   uuid NOT NULL REFERENCES recurring_invoice_templates(id) ON DELETE CASCADE,
  tenant_id     uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  product_id    uuid REFERENCES products(id),
  description   text NOT NULL,
  quantity      numeric(15,3) NOT NULL DEFAULT 1,
  unit_price    numeric(15,2) NOT NULL DEFAULT 0,
  vat_rate      numeric(5,2) NOT NULL DEFAULT 0,
  sort_order    integer NOT NULL DEFAULT 0
);

ALTER TABLE recurring_invoice_template_items ENABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS idx_riti_template ON recurring_invoice_template_items(template_id);

DROP POLICY IF EXISTS "riti_all" ON recurring_invoice_template_items;
CREATE POLICY "riti_all" ON recurring_invoice_template_items FOR ALL TO authenticated
  USING (is_tenant_member(tenant_id)) WITH CHECK (is_tenant_member(tenant_id));

CREATE OR REPLACE FUNCTION next_recurrence_date(p_from date, p_frequency text)
RETURNS date LANGUAGE sql IMMUTABLE AS $$
  SELECT CASE p_frequency
    WHEN 'weekly' THEN p_from + interval '7 days'
    WHEN 'monthly' THEN p_from + interval '1 month'
    WHEN 'quarterly' THEN p_from + interval '3 months'
    WHEN 'yearly' THEN p_from + interval '1 year'
  END::date;
$$;

-- Generates a draft invoice for every template due today or earlier.
-- Idempotent-safe to call repeatedly (it only touches templates whose
-- next_run_date <= current_date, and immediately advances that date).
CREATE OR REPLACE FUNCTION generate_due_recurring_invoices()
RETURNS TABLE (template_id uuid, invoice_id uuid)
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_tpl RECORD;
  v_item RECORD;
  v_invoice_id uuid;
  v_invoice_number text;
  v_subtotal numeric(15,2);
  v_vat numeric(15,2);
  v_total numeric(15,2);
BEGIN
  FOR v_tpl IN
    SELECT * FROM recurring_invoice_templates
    WHERE is_active AND next_run_date <= CURRENT_DATE
      AND (end_date IS NULL OR next_run_date <= end_date)
    FOR UPDATE
  LOOP
    v_invoice_number := next_invoice_number(v_tpl.tenant_id);

    INSERT INTO sales_invoices (
      tenant_id, invoice_number, invoice_date, due_date, customer_id, warehouse_id,
      status, currency, notes, terms, payment_method, created_by
    ) VALUES (
      v_tpl.tenant_id, v_invoice_number, CURRENT_DATE, CURRENT_DATE + (v_tpl.due_in_days || ' days')::interval,
      v_tpl.customer_id, v_tpl.warehouse_id, 'draft', v_tpl.currency, v_tpl.notes, v_tpl.terms, v_tpl.payment_method, v_tpl.created_by
    ) RETURNING id INTO v_invoice_id;

    v_subtotal := 0; v_vat := 0;

    FOR v_item IN SELECT * FROM recurring_invoice_template_items WHERE template_id = v_tpl.id ORDER BY sort_order LOOP
      DECLARE
        v_line_subtotal numeric(15,2) := round(v_item.quantity * v_item.unit_price, 2);
        v_line_vat numeric(15,2) := round(v_item.quantity * v_item.unit_price * v_item.vat_rate / 100, 2);
      BEGIN
        INSERT INTO sales_invoice_items (
          invoice_id, tenant_id, product_id, description, quantity, unit_price, vat_rate, subtotal, vat_amount, total, sort_order
        ) VALUES (
          v_invoice_id, v_tpl.tenant_id, v_item.product_id, v_item.description, v_item.quantity, v_item.unit_price,
          v_item.vat_rate, v_line_subtotal, v_line_vat, v_line_subtotal + v_line_vat, v_item.sort_order
        );
        v_subtotal := v_subtotal + v_line_subtotal;
        v_vat := v_vat + v_line_vat;
      END;
    END LOOP;

    v_total := v_subtotal + v_vat;
    UPDATE sales_invoices SET subtotal = v_subtotal, vat_amount = v_vat, total = v_total WHERE id = v_invoice_id;

    UPDATE recurring_invoice_templates
    SET next_run_date = next_recurrence_date(v_tpl.next_run_date, v_tpl.frequency),
        last_generated_invoice_id = v_invoice_id,
        is_active = CASE WHEN v_tpl.end_date IS NOT NULL AND next_recurrence_date(v_tpl.next_run_date, v_tpl.frequency) > v_tpl.end_date THEN false ELSE is_active END
    WHERE id = v_tpl.id;

    template_id := v_tpl.id;
    invoice_id := v_invoice_id;
    RETURN NEXT;
  END LOOP;
END;
$$;
-- Runs with elevated rights because it must act across every tenant that
-- has a due template, on a schedule, without a logged-in user session.
-- Only the service role (via cron/edge function) should call it.
REVOKE EXECUTE ON FUNCTION generate_due_recurring_invoices() FROM PUBLIC, anon, authenticated;
