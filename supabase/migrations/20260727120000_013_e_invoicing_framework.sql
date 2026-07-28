/*
# E-invoicing framework (provider-agnostic)

## Why this design
Electronic invoicing rules differ per country (Kenya's eTIMS, Rwanda's EBM,
future OHADA-zone requirements, etc.) and each requires its own
registration/certification with that country's tax authority before any
code can talk to it — that's a business/legal step, not something that
can be hard-coded generically.

Rather than guess which country to integrate first, this migration adds
the plumbing every provider will need, so whichever certification you get
first just plugs in as one new "provider adapter" in the edge function,
without touching the data model again:

- `tenant_e_invoice_config` — which provider a tenant uses + its
  non-secret settings (taxpayer ID, endpoint). Actual API keys/certificates
  belong in Supabase Edge Function secrets (per-provider, not per-tenant,
  unless you're a reseller), not in this table.
- `e_invoice_submissions` — one row per invoice submission attempt, with
  status, the provider's reference number, and the raw response — this is
  what you'll show the user ("En attente" / "Certifiée" / "Rejetée") and
  what auditors will want to see.
*/

CREATE TABLE IF NOT EXISTS tenant_e_invoice_config (
  tenant_id       uuid PRIMARY KEY REFERENCES tenants(id) ON DELETE CASCADE,
  provider        text NOT NULL DEFAULT 'none' CHECK (provider IN ('none', 'kenya_etims', 'rwanda_ebm', 'ohada_generic')),
  taxpayer_id     text,
  settings        jsonb NOT NULL DEFAULT '{}'::jsonb, -- non-secret provider config only
  is_enabled      boolean NOT NULL DEFAULT false,
  updated_at      timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE tenant_e_invoice_config ENABLE ROW LEVEL SECURITY;

DROP TRIGGER IF EXISTS teic_updated_at ON tenant_e_invoice_config;
CREATE TRIGGER teic_updated_at BEFORE UPDATE ON tenant_e_invoice_config
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

DROP POLICY IF EXISTS "teic_select" ON tenant_e_invoice_config;
CREATE POLICY "teic_select" ON tenant_e_invoice_config FOR SELECT TO authenticated
  USING (is_tenant_member(tenant_id) OR is_super_admin());
DROP POLICY IF EXISTS "teic_upsert" ON tenant_e_invoice_config;
CREATE POLICY "teic_upsert" ON tenant_e_invoice_config FOR INSERT TO authenticated
  WITH CHECK (is_tenant_admin(tenant_id));
DROP POLICY IF EXISTS "teic_update" ON tenant_e_invoice_config;
CREATE POLICY "teic_update" ON tenant_e_invoice_config FOR UPDATE TO authenticated
  USING (is_tenant_admin(tenant_id)) WITH CHECK (is_tenant_admin(tenant_id));

CREATE TABLE IF NOT EXISTS e_invoice_submissions (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id          uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  sales_invoice_id   uuid NOT NULL REFERENCES sales_invoices(id) ON DELETE CASCADE,
  provider           text NOT NULL,
  status             text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'submitted', 'certified', 'rejected', 'error')),
  provider_reference text, -- the tax authority's certification/receipt number
  response_payload   jsonb,
  error_message      text,
  submitted_at       timestamptz,
  created_at         timestamptz NOT NULL DEFAULT now(),
  UNIQUE (sales_invoice_id)
);

ALTER TABLE e_invoice_submissions ENABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS idx_eis_tenant ON e_invoice_submissions(tenant_id);

DROP POLICY IF EXISTS "eis_select" ON e_invoice_submissions;
CREATE POLICY "eis_select" ON e_invoice_submissions FOR SELECT TO authenticated
  USING (is_tenant_member(tenant_id) OR is_super_admin());
-- No client-side INSERT/UPDATE policy: submissions are only ever written
-- by the e-invoice-submit edge function using the service role, so a
-- tenant can never fake a "certified" status for themselves.

COMMENT ON TABLE e_invoice_submissions IS
  'Written only by the e-invoice-submit edge function (service role). Add a new provider by implementing one adapter in that function — this schema does not need to change.';
