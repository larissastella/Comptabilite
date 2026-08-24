/*
# Public API hardening: rate limiting + idempotency

Now that Enterprise-plan tenants will have real external platforms
integrating against /public-api, two gaps become real production risks
rather than theoretical ones:

1. No rate limiting at all — a buggy integration (retry loop, misconfigured
   polling interval) or a leaked key could hammer the database with no
   limit. Adds a per-key sliding-minute counter, enforced in the function.

2. No idempotency support on the write endpoint (POST /transactions) — a
   normal network retry (timeout, connection drop) from an external
   platform could double-post the same journal entry with no way for them
   to safely retry. Standard practice (Stripe, GitHub, etc.) is an
   Idempotency-Key header that returns the cached first response on
   retry instead of repeating the side effect.
*/

CREATE TABLE IF NOT EXISTS api_key_requests (
  key_hash      text NOT NULL,
  window_start  timestamptz NOT NULL,
  request_count integer NOT NULL DEFAULT 0,
  PRIMARY KEY (key_hash, window_start)
);
ALTER TABLE api_key_requests ENABLE ROW LEVEL SECURITY;
-- No client policy at all — only the service role (via check_api_rate_limit,
-- itself SECURITY DEFINER) ever touches this table. Nothing here is
-- tenant-scoped data anyway, just per-key request counters.

-- Old windows are cheap to accumulate but pointless to keep — a tenant
-- reasonably scoped nightly cleanup keeps this table small. (Not
-- required for correctness, just housekeeping.)
CREATE INDEX IF NOT EXISTS idx_api_key_requests_window ON api_key_requests(window_start);

-- Atomically increments the current 1-minute window's counter for a key
-- and returns whether the request should be ALLOWED (count <= p_limit).
-- Atomic because the UPSERT + RETURNING happens in one statement — two
-- concurrent requests can't both read count=99 and both proceed.
CREATE OR REPLACE FUNCTION public.check_api_rate_limit(p_key_hash text, p_limit integer DEFAULT 100)
RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_window timestamptz := date_trunc('minute', now());
  v_count integer;
BEGIN
  INSERT INTO api_key_requests (key_hash, window_start, request_count)
  VALUES (p_key_hash, v_window, 1)
  ON CONFLICT (key_hash, window_start)
  DO UPDATE SET request_count = api_key_requests.request_count + 1
  RETURNING request_count INTO v_count;

  RETURN v_count <= p_limit;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.check_api_rate_limit(text, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.check_api_rate_limit(text, integer) TO service_role;

CREATE TABLE IF NOT EXISTS api_idempotency_keys (
  key_hash        text NOT NULL,
  idempotency_key text NOT NULL,
  tenant_id       uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  response_status integer NOT NULL,
  response_body   jsonb NOT NULL,
  created_at      timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (key_hash, idempotency_key)
);
ALTER TABLE api_idempotency_keys ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "api_idempotency_no_client_access" ON api_idempotency_keys;
CREATE POLICY "api_idempotency_no_client_access" ON api_idempotency_keys FOR ALL TO authenticated
  USING (is_super_admin()) WITH CHECK (is_super_admin());
