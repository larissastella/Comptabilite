/*
# Enterprise API access

Lets an Enterprise-plan tenant generate API keys to integrate LiBooks
programmatically (read invoices, push transactions, etc. from their own
systems). Only the key's SHA-256 hash is stored — the plaintext key is
shown to the user exactly once, at creation time, like Stripe/GitHub do.
*/

CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA extensions;

CREATE TABLE IF NOT EXISTS api_keys (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id    uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  name         text NOT NULL,
  key_prefix   text NOT NULL, -- first 8 chars shown in the UI, e.g. "lbk_a1b2"
  key_hash     text NOT NULL, -- sha256 of the full key, never the plaintext
  scopes       text[] NOT NULL DEFAULT ARRAY['read'], -- 'read' | 'write'
  created_by   uuid REFERENCES auth.users(id),
  last_used_at timestamptz,
  revoked_at   timestamptz,
  created_at   timestamptz NOT NULL DEFAULT now(),
  UNIQUE (key_hash)
);

ALTER TABLE api_keys ENABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS idx_api_keys_tenant ON api_keys(tenant_id);
CREATE INDEX IF NOT EXISTS idx_api_keys_hash ON api_keys(key_hash) WHERE revoked_at IS NULL;

DROP POLICY IF EXISTS "ak_select" ON api_keys;
CREATE POLICY "ak_select" ON api_keys FOR SELECT TO authenticated
  USING (is_tenant_admin(tenant_id) OR is_super_admin());
-- No client-side INSERT: keys are only ever minted by create_api_key()
-- below, so the plaintext-generation + hash-storage step can't be skipped.
DROP POLICY IF EXISTS "ak_revoke" ON api_keys;
CREATE POLICY "ak_revoke" ON api_keys FOR UPDATE TO authenticated
  USING (is_tenant_admin(tenant_id)) WITH CHECK (is_tenant_admin(tenant_id));

-- Generates a new API key: only for Enterprise-plan tenants, only for a
-- tenant admin. Returns the plaintext key ONCE — the caller must show it
-- to the user immediately and never retrieve it again.
CREATE OR REPLACE FUNCTION create_api_key(p_tenant_id uuid, p_name text, p_scopes text[])
RETURNS text
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_plan plan_type;
  v_plaintext text;
  v_hash text;
BEGIN
  IF NOT (is_tenant_admin(p_tenant_id) OR is_super_admin()) THEN
    RAISE EXCEPTION 'Not authorized for this tenant';
  END IF;

  SELECT plan INTO v_plan FROM tenants WHERE id = p_tenant_id;
  IF v_plan <> 'enterprise' AND NOT is_super_admin() THEN
    RAISE EXCEPTION 'API access requires the Enterprise plan';
  END IF;

  v_plaintext := 'lbk_' || encode(gen_random_bytes(24), 'base64');
  v_plaintext := replace(replace(replace(v_plaintext, '/', '_'), '+', '-'), '=', '');
  v_hash := encode(digest(v_plaintext, 'sha256'), 'hex');

  INSERT INTO api_keys (tenant_id, name, key_prefix, key_hash, scopes, created_by)
  VALUES (p_tenant_id, p_name, left(v_plaintext, 12), v_hash, p_scopes, auth.uid());

  RETURN v_plaintext;
END;
$$;
REVOKE EXECUTE ON FUNCTION create_api_key(uuid, text, text[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION create_api_key(uuid, text, text[]) TO authenticated;

-- Verifies a plaintext API key (called by the public-api edge function
-- using the service role) and returns which tenant + scopes it grants,
-- or NULL if invalid/revoked. Also updates last_used_at.
CREATE OR REPLACE FUNCTION verify_api_key(p_plaintext_key text)
RETURNS TABLE (tenant_id uuid, scopes text[])
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_hash text;
BEGIN
  v_hash := encode(digest(p_plaintext_key, 'sha256'), 'hex');

  UPDATE api_keys SET last_used_at = now()
  WHERE key_hash = v_hash AND revoked_at IS NULL;

  RETURN QUERY
  SELECT ak.tenant_id, ak.scopes FROM api_keys ak
  WHERE ak.key_hash = v_hash AND ak.revoked_at IS NULL;
END;
$$;
-- Only the service role should ever call this (it's how the public API
-- edge function turns "Authorization: Bearer lbk_..." into a tenant_id).
REVOKE EXECUTE ON FUNCTION verify_api_key(text) FROM PUBLIC, anon, authenticated;
