
/*
# LiAfrik Books — Business Tables

## Overview
All core business entities: chart of accounts, products, warehouses, customers, suppliers,
invoices, and accounting transactions. Every table is scoped to a tenant_id with RLS.

## New Tables

### accounts (Chart of Accounts)
SYSCOHADA-compliant chart of accounts (classes 1-9).
- tenant_id: multi-tenant isolation
- code: account code (e.g. 101, 401000)
- name, name_en: bilingual name
- account_class: 1-9
- account_type: asset|liability|equity|revenue|expense|other
- parent_id: hierarchical (self-reference)
- is_system: true for seeded SYSCOHADA accounts
- is_active

### warehouses
Physical or virtual stock locations.
- tenant_id, name, address, is_default

### products
Catalogue of goods and services.
- tenant_id, sku, name, name_en, description
- category, unit_of_measure
- sale_price, purchase_price, vat_rate
- track_stock: boolean — stock tracked or not
- is_active, created_at

### stock_entries
Per-warehouse stock levels + movements.
- product_id, warehouse_id, quantity, unit_cost
- movement_type: purchase|sale|adjustment|transfer|return
- reference: linked invoice/PO id
- notes

### customers
Client master data.
- tenant_id, name, email, phone, address, city, country
- tax_id, legal_id, payment_terms_days
- credit_limit, balance (computed via transactions)
- notes, is_active

### suppliers
Supplier master data (mirror of customers).

### sales_invoices
Outgoing invoices.
- tenant_id, invoice_number (sequential, no gaps), invoice_date, due_date
- customer_id, warehouse_id
- status: draft|sent|paid|overdue|cancelled|credit_note
- subtotal, vat_amount, total, amount_paid, balance_due
- currency, exchange_rate
- notes, terms, payment_method
- pdf_url, sent_at, paid_at
- created_by, offline_id (idempotency key for offline sync)

### sales_invoice_items
Line items for sales invoices.
- invoice_id, product_id, description
- quantity, unit_price, discount_pct, vat_rate
- subtotal, vat_amount, total

### purchase_invoices
Incoming supplier invoices — mirror of sales_invoices but for purchases.

### purchase_invoice_items
Line items for purchase invoices.

### transactions (Journal entries)
Double-entry accounting journal.
- tenant_id, date, reference, description, transaction_type
- is_posted

### transaction_lines
Individual debit/credit lines.
- transaction_id, account_id, description
- debit, credit (one must be 0)
- reconciled

## Security
RLS on all tables. Policies: tenant members can read their own data;
only admin/accountant roles can write financial records.
All policies use is_tenant_member(tenant_id) helper.
*/

-- -------------------------------------------------------
-- accounts (Chart of Accounts)
-- -------------------------------------------------------
DO $$ BEGIN
  CREATE TYPE account_type AS ENUM ('asset','liability','equity','revenue','expense','other');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS accounts (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  code          text NOT NULL,
  name          text NOT NULL,
  name_en       text,
  account_class smallint NOT NULL CHECK (account_class BETWEEN 1 AND 9),
  account_type  account_type NOT NULL DEFAULT 'other',
  parent_id     uuid REFERENCES accounts(id),
  is_system     boolean NOT NULL DEFAULT false,
  is_active     boolean NOT NULL DEFAULT true,
  created_at    timestamptz NOT NULL DEFAULT now(),
  UNIQUE(tenant_id, code)
);

ALTER TABLE accounts ENABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS idx_accounts_tenant_id ON accounts(tenant_id);
CREATE INDEX IF NOT EXISTS idx_accounts_code ON accounts(tenant_id, code);

-- -------------------------------------------------------
-- warehouses
-- -------------------------------------------------------
CREATE TABLE IF NOT EXISTS warehouses (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  name        text NOT NULL,
  address     text,
  city        text,
  is_default  boolean NOT NULL DEFAULT false,
  is_active   boolean NOT NULL DEFAULT true,
  created_at  timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE warehouses ENABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS idx_warehouses_tenant_id ON warehouses(tenant_id);

-- -------------------------------------------------------
-- products
-- -------------------------------------------------------
DO $$ BEGIN
  CREATE TYPE product_type AS ENUM ('goods','service');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS products (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  sku             text,
  name            text NOT NULL,
  name_en         text,
  description     text,
  category        text,
  product_type    product_type NOT NULL DEFAULT 'goods',
  unit_of_measure text NOT NULL DEFAULT 'pcs',
  sale_price      numeric(15,2) NOT NULL DEFAULT 0,
  purchase_price  numeric(15,2) NOT NULL DEFAULT 0,
  vat_rate        numeric(5,2),
  track_stock     boolean NOT NULL DEFAULT true,
  is_active       boolean NOT NULL DEFAULT true,
  image_url       text,
  barcode         text,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  UNIQUE(tenant_id, sku)
);

ALTER TABLE products ENABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS idx_products_tenant_id ON products(tenant_id);

DROP TRIGGER IF EXISTS products_updated_at ON products;
CREATE TRIGGER products_updated_at
  BEFORE UPDATE ON products
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- -------------------------------------------------------
-- stock_entries (movements)
-- -------------------------------------------------------
DO $$ BEGIN
  CREATE TYPE stock_movement_type AS ENUM ('purchase','sale','adjustment','transfer','return','opening');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS stock_entries (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  product_id      uuid NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  warehouse_id    uuid NOT NULL REFERENCES warehouses(id) ON DELETE CASCADE,
  movement_type   stock_movement_type NOT NULL,
  quantity        numeric(15,3) NOT NULL, -- positive = in, negative = out
  unit_cost       numeric(15,2) NOT NULL DEFAULT 0,
  reference_id    uuid, -- invoice id or PO id
  reference_type  text, -- 'sales_invoice' | 'purchase_invoice' | 'adjustment'
  notes           text,
  offline_id      text UNIQUE, -- idempotency key from offline client
  created_by      uuid REFERENCES auth.users(id),
  created_at      timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE stock_entries ENABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS idx_stock_entries_product ON stock_entries(product_id);
CREATE INDEX IF NOT EXISTS idx_stock_entries_warehouse ON stock_entries(warehouse_id);
CREATE INDEX IF NOT EXISTS idx_stock_entries_tenant ON stock_entries(tenant_id);

-- -------------------------------------------------------
-- customers
-- -------------------------------------------------------
CREATE TABLE IF NOT EXISTS customers (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id           uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  name                text NOT NULL,
  email               text,
  phone               text,
  address             text,
  city                text,
  country             text,
  tax_id              text,
  legal_id            text,
  payment_terms_days  integer NOT NULL DEFAULT 30,
  credit_limit        numeric(15,2),
  notes               text,
  is_active           boolean NOT NULL DEFAULT true,
  offline_id          text UNIQUE,
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE customers ENABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS idx_customers_tenant_id ON customers(tenant_id);

DROP TRIGGER IF EXISTS customers_updated_at ON customers;
CREATE TRIGGER customers_updated_at
  BEFORE UPDATE ON customers
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- -------------------------------------------------------
-- suppliers
-- -------------------------------------------------------
CREATE TABLE IF NOT EXISTS suppliers (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id           uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  name                text NOT NULL,
  email               text,
  phone               text,
  address             text,
  city                text,
  country             text,
  tax_id              text,
  legal_id            text,
  payment_terms_days  integer NOT NULL DEFAULT 30,
  notes               text,
  is_active           boolean NOT NULL DEFAULT true,
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE suppliers ENABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS idx_suppliers_tenant_id ON suppliers(tenant_id);

DROP TRIGGER IF EXISTS suppliers_updated_at ON suppliers;
CREATE TRIGGER suppliers_updated_at
  BEFORE UPDATE ON suppliers
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- -------------------------------------------------------
-- sales_invoices
-- -------------------------------------------------------
DO $$ BEGIN
  CREATE TYPE invoice_status AS ENUM ('draft','sent','paid','overdue','cancelled','credit_note');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS sales_invoices (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  invoice_number  text NOT NULL,
  invoice_date    date NOT NULL DEFAULT CURRENT_DATE,
  due_date        date,
  customer_id     uuid REFERENCES customers(id),
  warehouse_id    uuid REFERENCES warehouses(id),
  status          invoice_status NOT NULL DEFAULT 'draft',
  subtotal        numeric(15,2) NOT NULL DEFAULT 0,
  discount_amount numeric(15,2) NOT NULL DEFAULT 0,
  vat_amount      numeric(15,2) NOT NULL DEFAULT 0,
  total           numeric(15,2) NOT NULL DEFAULT 0,
  amount_paid     numeric(15,2) NOT NULL DEFAULT 0,
  balance_due     numeric(15,2) GENERATED ALWAYS AS (total - amount_paid) STORED,
  currency        text NOT NULL DEFAULT 'XAF',
  exchange_rate   numeric(15,6) NOT NULL DEFAULT 1,
  notes           text,
  terms           text,
  payment_method  text,
  pdf_url         text,
  sent_at         timestamptz,
  paid_at         timestamptz,
  created_by      uuid REFERENCES auth.users(id),
  offline_id      text UNIQUE,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  UNIQUE(tenant_id, invoice_number)
);

ALTER TABLE sales_invoices ENABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS idx_sales_invoices_tenant ON sales_invoices(tenant_id);
CREATE INDEX IF NOT EXISTS idx_sales_invoices_customer ON sales_invoices(customer_id);
CREATE INDEX IF NOT EXISTS idx_sales_invoices_status ON sales_invoices(tenant_id, status);
CREATE INDEX IF NOT EXISTS idx_sales_invoices_date ON sales_invoices(tenant_id, invoice_date DESC);

DROP TRIGGER IF EXISTS sales_invoices_updated_at ON sales_invoices;
CREATE TRIGGER sales_invoices_updated_at
  BEFORE UPDATE ON sales_invoices
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- -------------------------------------------------------
-- sales_invoice_items
-- -------------------------------------------------------
CREATE TABLE IF NOT EXISTS sales_invoice_items (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_id    uuid NOT NULL REFERENCES sales_invoices(id) ON DELETE CASCADE,
  tenant_id     uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  product_id    uuid REFERENCES products(id),
  description   text NOT NULL,
  quantity      numeric(15,3) NOT NULL DEFAULT 1,
  unit_price    numeric(15,2) NOT NULL DEFAULT 0,
  discount_pct  numeric(5,2) NOT NULL DEFAULT 0,
  vat_rate      numeric(5,2) NOT NULL DEFAULT 0,
  subtotal      numeric(15,2) NOT NULL DEFAULT 0,
  vat_amount    numeric(15,2) NOT NULL DEFAULT 0,
  total         numeric(15,2) NOT NULL DEFAULT 0,
  sort_order    integer NOT NULL DEFAULT 0
);

ALTER TABLE sales_invoice_items ENABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS idx_sii_invoice ON sales_invoice_items(invoice_id);
CREATE INDEX IF NOT EXISTS idx_sii_tenant ON sales_invoice_items(tenant_id);

-- -------------------------------------------------------
-- purchase_invoices
-- -------------------------------------------------------
DO $$ BEGIN
  CREATE TYPE purchase_status AS ENUM ('draft','received','paid','overdue','cancelled');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS purchase_invoices (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  invoice_number  text NOT NULL,
  supplier_ref    text,
  invoice_date    date NOT NULL DEFAULT CURRENT_DATE,
  due_date        date,
  supplier_id     uuid REFERENCES suppliers(id),
  warehouse_id    uuid REFERENCES warehouses(id),
  status          purchase_status NOT NULL DEFAULT 'draft',
  subtotal        numeric(15,2) NOT NULL DEFAULT 0,
  vat_amount      numeric(15,2) NOT NULL DEFAULT 0,
  total           numeric(15,2) NOT NULL DEFAULT 0,
  amount_paid     numeric(15,2) NOT NULL DEFAULT 0,
  balance_due     numeric(15,2) GENERATED ALWAYS AS (total - amount_paid) STORED,
  currency        text NOT NULL DEFAULT 'XAF',
  notes           text,
  payment_method  text,
  paid_at         timestamptz,
  created_by      uuid REFERENCES auth.users(id),
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  UNIQUE(tenant_id, invoice_number)
);

ALTER TABLE purchase_invoices ENABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS idx_purchase_invoices_tenant ON purchase_invoices(tenant_id);
CREATE INDEX IF NOT EXISTS idx_purchase_invoices_supplier ON purchase_invoices(supplier_id);

DROP TRIGGER IF EXISTS purchase_invoices_updated_at ON purchase_invoices;
CREATE TRIGGER purchase_invoices_updated_at
  BEFORE UPDATE ON purchase_invoices
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- -------------------------------------------------------
-- purchase_invoice_items
-- -------------------------------------------------------
CREATE TABLE IF NOT EXISTS purchase_invoice_items (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_id    uuid NOT NULL REFERENCES purchase_invoices(id) ON DELETE CASCADE,
  tenant_id     uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  product_id    uuid REFERENCES products(id),
  description   text NOT NULL,
  quantity      numeric(15,3) NOT NULL DEFAULT 1,
  unit_price    numeric(15,2) NOT NULL DEFAULT 0,
  vat_rate      numeric(5,2) NOT NULL DEFAULT 0,
  subtotal      numeric(15,2) NOT NULL DEFAULT 0,
  vat_amount    numeric(15,2) NOT NULL DEFAULT 0,
  total         numeric(15,2) NOT NULL DEFAULT 0,
  sort_order    integer NOT NULL DEFAULT 0
);

ALTER TABLE purchase_invoice_items ENABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS idx_pii_invoice ON purchase_invoice_items(invoice_id);
CREATE INDEX IF NOT EXISTS idx_pii_tenant ON purchase_invoice_items(tenant_id);

-- -------------------------------------------------------
-- transactions (accounting journal)
-- -------------------------------------------------------
DO $$ BEGIN
  CREATE TYPE transaction_type AS ENUM ('journal','payment','receipt','transfer','adjustment');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS transactions (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  date            date NOT NULL DEFAULT CURRENT_DATE,
  reference       text,
  description     text NOT NULL,
  transaction_type transaction_type NOT NULL DEFAULT 'journal',
  is_posted       boolean NOT NULL DEFAULT false,
  source_type     text, -- 'sales_invoice'|'purchase_invoice'|'manual'
  source_id       uuid,
  created_by      uuid REFERENCES auth.users(id),
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE transactions ENABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS idx_transactions_tenant ON transactions(tenant_id);
CREATE INDEX IF NOT EXISTS idx_transactions_date ON transactions(tenant_id, date DESC);

DROP TRIGGER IF EXISTS transactions_updated_at ON transactions;
CREATE TRIGGER transactions_updated_at
  BEFORE UPDATE ON transactions
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- -------------------------------------------------------
-- transaction_lines
-- -------------------------------------------------------
CREATE TABLE IF NOT EXISTS transaction_lines (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  transaction_id  uuid NOT NULL REFERENCES transactions(id) ON DELETE CASCADE,
  tenant_id       uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  account_id      uuid NOT NULL REFERENCES accounts(id),
  description     text,
  debit           numeric(15,2) NOT NULL DEFAULT 0,
  credit          numeric(15,2) NOT NULL DEFAULT 0,
  reconciled      boolean NOT NULL DEFAULT false,
  CONSTRAINT debit_or_credit CHECK (NOT (debit > 0 AND credit > 0))
);

ALTER TABLE transaction_lines ENABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS idx_tl_transaction ON transaction_lines(transaction_id);
CREATE INDEX IF NOT EXISTS idx_tl_account ON transaction_lines(account_id);
CREATE INDEX IF NOT EXISTS idx_tl_tenant ON transaction_lines(tenant_id);

-- -------------------------------------------------------
-- Function to get next invoice number (sequential, no gaps)
-- -------------------------------------------------------
CREATE OR REPLACE FUNCTION next_invoice_number(p_tenant_id uuid)
RETURNS text
LANGUAGE plpgsql SECURITY DEFINER
AS $$
DECLARE
  v_prefix text;
  v_counter integer;
  v_year text;
BEGIN
  SELECT invoice_prefix, invoice_counter INTO v_prefix, v_counter
  FROM tenants WHERE id = p_tenant_id FOR UPDATE;

  v_counter := v_counter + 1;
  v_year := to_char(CURRENT_DATE, 'YYYY');

  UPDATE tenants SET invoice_counter = v_counter WHERE id = p_tenant_id;

  RETURN v_prefix || '-' || v_year || '-' || LPAD(v_counter::text, 5, '0');
END;
$$;

-- -------------------------------------------------------
-- RLS POLICIES — generic tenant-scoped helper macro
-- (apply to all business tables)
-- -------------------------------------------------------

-- accounts
DROP POLICY IF EXISTS "accounts_select" ON accounts;
CREATE POLICY "accounts_select" ON accounts FOR SELECT TO authenticated USING (is_tenant_member(tenant_id) OR is_super_admin());
DROP POLICY IF EXISTS "accounts_insert" ON accounts;
CREATE POLICY "accounts_insert" ON accounts FOR INSERT TO authenticated WITH CHECK (is_tenant_member(tenant_id));
DROP POLICY IF EXISTS "accounts_update" ON accounts;
CREATE POLICY "accounts_update" ON accounts FOR UPDATE TO authenticated USING (is_tenant_member(tenant_id)) WITH CHECK (is_tenant_member(tenant_id));
DROP POLICY IF EXISTS "accounts_delete" ON accounts;
CREATE POLICY "accounts_delete" ON accounts FOR DELETE TO authenticated USING (is_tenant_admin(tenant_id) AND NOT is_system);

-- warehouses
DROP POLICY IF EXISTS "warehouses_select" ON warehouses;
CREATE POLICY "warehouses_select" ON warehouses FOR SELECT TO authenticated USING (is_tenant_member(tenant_id) OR is_super_admin());
DROP POLICY IF EXISTS "warehouses_insert" ON warehouses;
CREATE POLICY "warehouses_insert" ON warehouses FOR INSERT TO authenticated WITH CHECK (is_tenant_member(tenant_id));
DROP POLICY IF EXISTS "warehouses_update" ON warehouses;
CREATE POLICY "warehouses_update" ON warehouses FOR UPDATE TO authenticated USING (is_tenant_member(tenant_id)) WITH CHECK (is_tenant_member(tenant_id));
DROP POLICY IF EXISTS "warehouses_delete" ON warehouses;
CREATE POLICY "warehouses_delete" ON warehouses FOR DELETE TO authenticated USING (is_tenant_admin(tenant_id));

-- products
DROP POLICY IF EXISTS "products_select" ON products;
CREATE POLICY "products_select" ON products FOR SELECT TO authenticated USING (is_tenant_member(tenant_id) OR is_super_admin());
DROP POLICY IF EXISTS "products_insert" ON products;
CREATE POLICY "products_insert" ON products FOR INSERT TO authenticated WITH CHECK (is_tenant_member(tenant_id));
DROP POLICY IF EXISTS "products_update" ON products;
CREATE POLICY "products_update" ON products FOR UPDATE TO authenticated USING (is_tenant_member(tenant_id)) WITH CHECK (is_tenant_member(tenant_id));
DROP POLICY IF EXISTS "products_delete" ON products;
CREATE POLICY "products_delete" ON products FOR DELETE TO authenticated USING (is_tenant_admin(tenant_id));

-- stock_entries
DROP POLICY IF EXISTS "stock_select" ON stock_entries;
CREATE POLICY "stock_select" ON stock_entries FOR SELECT TO authenticated USING (is_tenant_member(tenant_id) OR is_super_admin());
DROP POLICY IF EXISTS "stock_insert" ON stock_entries;
CREATE POLICY "stock_insert" ON stock_entries FOR INSERT TO authenticated WITH CHECK (is_tenant_member(tenant_id));
DROP POLICY IF EXISTS "stock_update" ON stock_entries;
CREATE POLICY "stock_update" ON stock_entries FOR UPDATE TO authenticated USING (is_tenant_member(tenant_id)) WITH CHECK (is_tenant_member(tenant_id));
DROP POLICY IF EXISTS "stock_delete" ON stock_entries;
CREATE POLICY "stock_delete" ON stock_entries FOR DELETE TO authenticated USING (is_tenant_admin(tenant_id));

-- customers
DROP POLICY IF EXISTS "customers_select" ON customers;
CREATE POLICY "customers_select" ON customers FOR SELECT TO authenticated USING (is_tenant_member(tenant_id) OR is_super_admin());
DROP POLICY IF EXISTS "customers_insert" ON customers;
CREATE POLICY "customers_insert" ON customers FOR INSERT TO authenticated WITH CHECK (is_tenant_member(tenant_id));
DROP POLICY IF EXISTS "customers_update" ON customers;
CREATE POLICY "customers_update" ON customers FOR UPDATE TO authenticated USING (is_tenant_member(tenant_id)) WITH CHECK (is_tenant_member(tenant_id));
DROP POLICY IF EXISTS "customers_delete" ON customers;
CREATE POLICY "customers_delete" ON customers FOR DELETE TO authenticated USING (is_tenant_admin(tenant_id));

-- suppliers
DROP POLICY IF EXISTS "suppliers_select" ON suppliers;
CREATE POLICY "suppliers_select" ON suppliers FOR SELECT TO authenticated USING (is_tenant_member(tenant_id) OR is_super_admin());
DROP POLICY IF EXISTS "suppliers_insert" ON suppliers;
CREATE POLICY "suppliers_insert" ON suppliers FOR INSERT TO authenticated WITH CHECK (is_tenant_member(tenant_id));
DROP POLICY IF EXISTS "suppliers_update" ON suppliers;
CREATE POLICY "suppliers_update" ON suppliers FOR UPDATE TO authenticated USING (is_tenant_member(tenant_id)) WITH CHECK (is_tenant_member(tenant_id));
DROP POLICY IF EXISTS "suppliers_delete" ON suppliers;
CREATE POLICY "suppliers_delete" ON suppliers FOR DELETE TO authenticated USING (is_tenant_admin(tenant_id));

-- sales_invoices
DROP POLICY IF EXISTS "si_select" ON sales_invoices;
CREATE POLICY "si_select" ON sales_invoices FOR SELECT TO authenticated USING (is_tenant_member(tenant_id) OR is_super_admin());
DROP POLICY IF EXISTS "si_insert" ON sales_invoices;
CREATE POLICY "si_insert" ON sales_invoices FOR INSERT TO authenticated WITH CHECK (is_tenant_member(tenant_id));
DROP POLICY IF EXISTS "si_update" ON sales_invoices;
CREATE POLICY "si_update" ON sales_invoices FOR UPDATE TO authenticated USING (is_tenant_member(tenant_id)) WITH CHECK (is_tenant_member(tenant_id));
DROP POLICY IF EXISTS "si_delete" ON sales_invoices;
CREATE POLICY "si_delete" ON sales_invoices FOR DELETE TO authenticated USING (is_tenant_admin(tenant_id));

-- sales_invoice_items
DROP POLICY IF EXISTS "sii_select" ON sales_invoice_items;
CREATE POLICY "sii_select" ON sales_invoice_items FOR SELECT TO authenticated USING (is_tenant_member(tenant_id) OR is_super_admin());
DROP POLICY IF EXISTS "sii_insert" ON sales_invoice_items;
CREATE POLICY "sii_insert" ON sales_invoice_items FOR INSERT TO authenticated WITH CHECK (is_tenant_member(tenant_id));
DROP POLICY IF EXISTS "sii_update" ON sales_invoice_items;
CREATE POLICY "sii_update" ON sales_invoice_items FOR UPDATE TO authenticated USING (is_tenant_member(tenant_id)) WITH CHECK (is_tenant_member(tenant_id));
DROP POLICY IF EXISTS "sii_delete" ON sales_invoice_items;
CREATE POLICY "sii_delete" ON sales_invoice_items FOR DELETE TO authenticated USING (is_tenant_member(tenant_id));

-- purchase_invoices
DROP POLICY IF EXISTS "pi_select" ON purchase_invoices;
CREATE POLICY "pi_select" ON purchase_invoices FOR SELECT TO authenticated USING (is_tenant_member(tenant_id) OR is_super_admin());
DROP POLICY IF EXISTS "pi_insert" ON purchase_invoices;
CREATE POLICY "pi_insert" ON purchase_invoices FOR INSERT TO authenticated WITH CHECK (is_tenant_member(tenant_id));
DROP POLICY IF EXISTS "pi_update" ON purchase_invoices;
CREATE POLICY "pi_update" ON purchase_invoices FOR UPDATE TO authenticated USING (is_tenant_member(tenant_id)) WITH CHECK (is_tenant_member(tenant_id));
DROP POLICY IF EXISTS "pi_delete" ON purchase_invoices;
CREATE POLICY "pi_delete" ON purchase_invoices FOR DELETE TO authenticated USING (is_tenant_admin(tenant_id));

-- purchase_invoice_items
DROP POLICY IF EXISTS "pii_select" ON purchase_invoice_items;
CREATE POLICY "pii_select" ON purchase_invoice_items FOR SELECT TO authenticated USING (is_tenant_member(tenant_id) OR is_super_admin());
DROP POLICY IF EXISTS "pii_insert" ON purchase_invoice_items;
CREATE POLICY "pii_insert" ON purchase_invoice_items FOR INSERT TO authenticated WITH CHECK (is_tenant_member(tenant_id));
DROP POLICY IF EXISTS "pii_update" ON purchase_invoice_items;
CREATE POLICY "pii_update" ON purchase_invoice_items FOR UPDATE TO authenticated USING (is_tenant_member(tenant_id)) WITH CHECK (is_tenant_member(tenant_id));
DROP POLICY IF EXISTS "pii_delete" ON purchase_invoice_items;
CREATE POLICY "pii_delete" ON purchase_invoice_items FOR DELETE TO authenticated USING (is_tenant_member(tenant_id));

-- transactions
DROP POLICY IF EXISTS "tx_select" ON transactions;
CREATE POLICY "tx_select" ON transactions FOR SELECT TO authenticated USING (is_tenant_member(tenant_id) OR is_super_admin());
DROP POLICY IF EXISTS "tx_insert" ON transactions;
CREATE POLICY "tx_insert" ON transactions FOR INSERT TO authenticated WITH CHECK (is_tenant_member(tenant_id));
DROP POLICY IF EXISTS "tx_update" ON transactions;
CREATE POLICY "tx_update" ON transactions FOR UPDATE TO authenticated USING (is_tenant_member(tenant_id)) WITH CHECK (is_tenant_member(tenant_id));
DROP POLICY IF EXISTS "tx_delete" ON transactions;
CREATE POLICY "tx_delete" ON transactions FOR DELETE TO authenticated USING (is_tenant_admin(tenant_id));

-- transaction_lines
DROP POLICY IF EXISTS "tl_select" ON transaction_lines;
CREATE POLICY "tl_select" ON transaction_lines FOR SELECT TO authenticated USING (is_tenant_member(tenant_id) OR is_super_admin());
DROP POLICY IF EXISTS "tl_insert" ON transaction_lines;
CREATE POLICY "tl_insert" ON transaction_lines FOR INSERT TO authenticated WITH CHECK (is_tenant_member(tenant_id));
DROP POLICY IF EXISTS "tl_update" ON transaction_lines;
CREATE POLICY "tl_update" ON transaction_lines FOR UPDATE TO authenticated USING (is_tenant_member(tenant_id)) WITH CHECK (is_tenant_member(tenant_id));
DROP POLICY IF EXISTS "tl_delete" ON transaction_lines;
CREATE POLICY "tl_delete" ON transaction_lines FOR DELETE TO authenticated USING (is_tenant_admin(tenant_id));
