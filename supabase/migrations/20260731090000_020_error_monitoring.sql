/*
# Free, self-hosted error monitoring

No external service (Sentry etc.) required -- errors are captured
directly into your own Supabase database and surfaced in
Super Admin > Monitoring. Zero ongoing cost.

## Tables
- `client_errors` -- uncaught JS errors and React crashes from the
  browser (frontend).
- `function_errors` -- errors caught inside Edge Functions (backend),
  especially important for payment-related functions where a silent
  failure could mean a client paid but never got activated.
*/

CREATE TABLE IF NOT EXISTS client_errors (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id    uuid REFERENCES tenants(id) ON DELETE SET NULL,
  user_id      uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  message      text NOT NULL,
  stack        text,
  url          text,
  user_agent   text,
  severity     text NOT NULL DEFAULT 'error' CHECK (severity IN ('error', 'warning')),
  resolved     boolean NOT NULL DEFAULT false,
  created_at   timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE client_errors ENABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS idx_client_errors_created ON client_errors(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_client_errors_unresolved ON client_errors(created_at DESC) WHERE NOT resolved;

-- Anyone (even anonymous/logged-out visitors) can report a client-side
-- error -- that's the whole point, a crash can happen before login. No
-- sensitive data should ever be sent here (enforced by convention in the
-- reporting code, not by the schema, same trust level as an analytics ping).
DROP POLICY IF EXISTS "ce_insert" ON client_errors;
CREATE POLICY "ce_insert" ON client_errors FOR INSERT TO anon, authenticated
  WITH CHECK (true);
DROP POLICY IF EXISTS "ce_select" ON client_errors;
CREATE POLICY "ce_select" ON client_errors FOR SELECT TO authenticated
  USING (is_super_admin() OR EXISTS (SELECT 1 FROM internal_staff_users WHERE user_id = auth.uid()));
DROP POLICY IF EXISTS "ce_update" ON client_errors;
CREATE POLICY "ce_update" ON client_errors FOR UPDATE TO authenticated
  USING (is_super_admin() OR EXISTS (SELECT 1 FROM internal_staff_users WHERE user_id = auth.uid()))
  WITH CHECK (is_super_admin() OR EXISTS (SELECT 1 FROM internal_staff_users WHERE user_id = auth.uid()));

CREATE TABLE IF NOT EXISTS function_errors (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  function_name text NOT NULL,
  tenant_id     uuid REFERENCES tenants(id) ON DELETE SET NULL,
  message       text NOT NULL,
  context       jsonb DEFAULT '{}'::jsonb,
  resolved      boolean NOT NULL DEFAULT false,
  created_at    timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE function_errors ENABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS idx_function_errors_created ON function_errors(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_function_errors_unresolved ON function_errors(created_at DESC) WHERE NOT resolved;

-- Only the service role (edge functions) writes here directly -- no
-- client-side INSERT policy at all, so a visitor can never forge a fake
-- backend error entry.
DROP POLICY IF EXISTS "fe_select" ON function_errors;
CREATE POLICY "fe_select" ON function_errors FOR SELECT TO authenticated
  USING (is_super_admin() OR EXISTS (SELECT 1 FROM internal_staff_users WHERE user_id = auth.uid()));
DROP POLICY IF EXISTS "fe_update" ON function_errors;
CREATE POLICY "fe_update" ON function_errors FOR UPDATE TO authenticated
  USING (is_super_admin() OR EXISTS (SELECT 1 FROM internal_staff_users WHERE user_id = auth.uid()))
  WITH CHECK (is_super_admin() OR EXISTS (SELECT 1 FROM internal_staff_users WHERE user_id = auth.uid()));
