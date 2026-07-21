/*
# Commercial Tracking System — Referral Events, Code Management, Performance Analytics

## Overview
Enhances the commercial tracking system with:
- A dedicated `commercial_referral_events` table tracking every stage of a referral
  (code_entered → signup → trial_started → trial_converted → trial_expired → churned)
- A `commercial_code_assignments` audit table for manual code generation/assignment
- Additional columns on `internal_staff_users` for performance tracking metadata
- Helper functions for churn rate, conversion funnel, and revenue-by-plan analytics

## New Tables

### commercial_referral_events
Tracks every event in the commercial referral lifecycle.
- id: UUID PK
- staff_code: the commercial code (FK to internal_staff_users.staff_code)
- tenant_id: the referred tenant (nullable — set at signup)
- event_type: enum (code_entered, signup, trial_started, trial_converted, trial_expired, churned)
- event_data: jsonb for additional context (plan, revenue, etc.)
- created_at: timestamp

### commercial_code_assignments
Audit log for manual code generation and assignment by super admins.
- id: UUID PK
- staff_user_id: FK to internal_staff_users
- staff_code: the code assigned
- assigned_by: FK to auth.users (super admin who created it)
- action: 'generated' | 'revoked' | 'reassigned'
- notes: text
- created_at: timestamp

## Modified Tables
- `internal_staff_users`: added `total_referrals` (int default 0), `total_conversions` (int default 0),
  `total_revenue_usd` (numeric default 0), `last_activity_at` (timestamptz)

## Security
- RLS enabled on all new tables
- Only super admins can read/write commercial tracking data
- Internal staff can read their own referral events
- All changes audit-logged
*/

-- -------------------------------------------------------
-- 1. Add performance tracking columns to internal_staff_users
-- -------------------------------------------------------
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'internal_staff_users' AND column_name = 'total_referrals'
  ) THEN
    ALTER TABLE internal_staff_users ADD COLUMN total_referrals integer NOT NULL DEFAULT 0;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'internal_staff_users' AND column_name = 'total_conversions'
  ) THEN
    ALTER TABLE internal_staff_users ADD COLUMN total_conversions integer NOT NULL DEFAULT 0;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'internal_staff_users' AND column_name = 'total_revenue_usd'
  ) THEN
    ALTER TABLE internal_staff_users ADD COLUMN total_revenue_usd numeric(12,2) NOT NULL DEFAULT 0;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'internal_staff_users' AND column_name = 'last_activity_at'
  ) THEN
    ALTER TABLE internal_staff_users ADD COLUMN last_activity_at timestamptz;
  END IF;
END $$;

-- -------------------------------------------------------
-- 2. commercial_referral_events
-- -------------------------------------------------------
DO $$ BEGIN
  CREATE TYPE referral_event_type AS ENUM (
    'code_entered', 'signup', 'trial_started', 'trial_converted', 'trial_expired', 'churned'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS commercial_referral_events (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  staff_code  text NOT NULL,
  tenant_id   uuid REFERENCES tenants(id) ON DELETE SET NULL,
  event_type  referral_event_type NOT NULL,
  event_data  jsonb DEFAULT '{}',
  created_at  timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE commercial_referral_events ENABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS idx_referral_events_staff_code ON commercial_referral_events(staff_code);
CREATE INDEX IF NOT EXISTS idx_referral_events_tenant_id ON commercial_referral_events(tenant_id);
CREATE INDEX IF NOT EXISTS idx_referral_events_event_type ON commercial_referral_events(event_type);
CREATE INDEX IF NOT EXISTS idx_referral_events_created_at ON commercial_referral_events(created_at DESC);

-- -------------------------------------------------------
-- 3. commercial_code_assignments
-- -------------------------------------------------------
CREATE TABLE IF NOT EXISTS commercial_code_assignments (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  staff_user_id uuid REFERENCES internal_staff_users(id) ON DELETE CASCADE,
  staff_code    text NOT NULL,
  assigned_by   uuid REFERENCES auth.users(id),
  action        text NOT NULL DEFAULT 'generated',
  notes         text,
  created_at    timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE commercial_code_assignments ENABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS idx_code_assignments_staff_user_id ON commercial_code_assignments(staff_user_id);

-- -------------------------------------------------------
-- 4. RLS Policies — commercial_referral_events
-- -------------------------------------------------------
DROP POLICY IF EXISTS "cre_select" ON commercial_referral_events;
CREATE POLICY "cre_select" ON commercial_referral_events FOR SELECT
TO authenticated
USING (
  is_super_admin() OR
  EXISTS (
    SELECT 1 FROM internal_staff_users
    WHERE internal_staff_users.user_id = auth.uid()
    AND internal_staff_users.is_active = true
    AND internal_staff_users.staff_code = commercial_referral_events.staff_code
  )
);

DROP POLICY IF EXISTS "cre_insert" ON commercial_referral_events;
CREATE POLICY "cre_insert" ON commercial_referral_events FOR INSERT
TO authenticated
WITH CHECK (is_super_admin() OR is_internal_staff());

-- -------------------------------------------------------
-- 5. RLS Policies — commercial_code_assignments
-- -------------------------------------------------------
DROP POLICY IF EXISTS "cca_select" ON commercial_code_assignments;
CREATE POLICY "cca_select" ON commercial_code_assignments FOR SELECT
TO authenticated
USING (is_super_admin());

DROP POLICY IF EXISTS "cca_insert" ON commercial_code_assignments;
CREATE POLICY "cca_insert" ON commercial_code_assignments FOR INSERT
TO authenticated
WITH CHECK (is_super_admin());

-- -------------------------------------------------------
-- 6. Helper: log referral event
-- -------------------------------------------------------
CREATE OR REPLACE FUNCTION log_referral_event(
  p_staff_code text,
  p_event_type referral_event_type,
  p_tenant_id uuid DEFAULT NULL,
  p_event_data jsonb DEFAULT '{}'::jsonb
)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
AS $$
BEGIN
  INSERT INTO commercial_referral_events (staff_code, tenant_id, event_type, event_data)
  VALUES (p_staff_code, p_tenant_id, p_event_type, p_event_data);

  -- Update staff user's last_activity_at
  UPDATE internal_staff_users
  SET last_activity_at = now()
  WHERE staff_code = p_staff_code;
END;
$$;

-- -------------------------------------------------------
-- 7. Helper: recompute staff performance stats
-- -------------------------------------------------------
CREATE OR REPLACE FUNCTION recompute_staff_stats(p_staff_code text)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
AS $$
DECLARE
  v_referrals int;
  v_conversions int;
  v_revenue numeric(12,2);
BEGIN
  SELECT count(DISTINCT id) INTO v_referrals
  FROM tenants WHERE referred_by_staff_code = p_staff_code;

  SELECT count(DISTINCT id) INTO v_conversions
  FROM tenants WHERE referred_by_staff_code = p_staff_code AND subscription_status = 'active';

  SELECT COALESCE(SUM(
    CASE
      WHEN plan = 'enterprise' THEN 189
      WHEN plan = 'premium' THEN 69
      WHEN plan = 'pro' THEN 19
      ELSE 9
    END
  ), 0) INTO v_revenue
  FROM tenants
  WHERE referred_by_staff_code = p_staff_code AND subscription_status = 'active';

  UPDATE internal_staff_users
  SET total_referrals = v_referrals,
      total_conversions = v_conversions,
      total_revenue_usd = v_revenue
  WHERE staff_code = p_staff_code;
END;
$$;

-- -------------------------------------------------------
-- 8. Helper: get conversion funnel data
-- -------------------------------------------------------
CREATE OR REPLACE FUNCTION get_conversion_funnel(p_days int DEFAULT 90)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
AS $$
DECLARE
  v_since timestamptz := now() - (p_days || ' days')::interval;
  v_code_entered int;
  v_signup int;
  v_trial_started int;
  v_trial_converted int;
  v_trial_expired int;
  v_churned int;
BEGIN
  SELECT count(*) INTO v_code_entered
  FROM commercial_referral_events
  WHERE event_type = 'code_entered' AND created_at >= v_since;

  SELECT count(*) INTO v_signup
  FROM commercial_referral_events
  WHERE event_type = 'signup' AND created_at >= v_since;

  SELECT count(*) INTO v_trial_started
  FROM commercial_referral_events
  WHERE event_type = 'trial_started' AND created_at >= v_since;

  SELECT count(*) INTO v_trial_converted
  FROM commercial_referral_events
  WHERE event_type = 'trial_converted' AND created_at >= v_since;

  SELECT count(*) INTO v_trial_expired
  FROM commercial_referral_events
  WHERE event_type = 'trial_expired' AND created_at >= v_since;

  SELECT count(*) INTO v_churned
  FROM commercial_referral_events
  WHERE event_type = 'churned' AND created_at >= v_since;

  RETURN jsonb_build_object(
    'code_entered', v_code_entered,
    'signup', v_signup,
    'trial_started', v_trial_started,
    'trial_converted', v_trial_converted,
    'trial_expired', v_trial_expired,
    'churned', v_churned
  );
END;
$$;

-- -------------------------------------------------------
-- 9. Helper: get churn rate
-- -------------------------------------------------------
CREATE OR REPLACE FUNCTION get_churn_rate(p_days int DEFAULT 90)
RETURNS numeric(5,2)
LANGUAGE plpgsql SECURITY DEFINER
AS $$
DECLARE
  v_total_active int;
  v_churned int;
  v_rate numeric(5,2);
BEGIN
  SELECT count(*) INTO v_total_active
  FROM tenants
  WHERE created_at >= now() - (p_days || ' days')::interval
  AND subscription_status IN ('active', 'trialing', 'past_due', 'canceled', 'read_only');

  SELECT count(*) INTO v_churned
  FROM tenants
  WHERE created_at >= now() - (p_days || ' days')::interval
  AND subscription_status IN ('canceled', 'read_only');

  IF v_total_active = 0 THEN
    RETURN 0;
  END IF;

  v_rate := ROUND((v_churned::numeric / v_total_active) * 100, 2);
  RETURN v_rate;
END;
$$;

-- -------------------------------------------------------
-- 10. Trigger: auto-log referral events on tenant creation
-- -------------------------------------------------------
CREATE OR REPLACE FUNCTION log_referral_on_tenant_create()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER
AS $$
BEGIN
  IF NEW.referred_by_staff_code IS NOT NULL AND NEW.referred_by_staff_code != '' THEN
    -- Log signup event
    INSERT INTO commercial_referral_events (staff_code, tenant_id, event_type, event_data)
    VALUES (NEW.referred_by_staff_code, NEW.id, 'signup', jsonb_build_object('tenant_name', NEW.name, 'plan', NEW.plan));

    -- Log trial_started event
    INSERT INTO commercial_referral_events (staff_code, tenant_id, event_type, event_data)
    VALUES (NEW.referred_by_staff_code, NEW.id, 'trial_started', jsonb_build_object('trial_ends_at', NEW.trial_ends_at));

    -- Recompute staff stats
    PERFORM recompute_staff_stats(NEW.referred_by_staff_code);
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_log_referral_on_create ON tenants;
CREATE TRIGGER trg_log_referral_on_create
  AFTER INSERT ON tenants
  FOR EACH ROW EXECUTE FUNCTION log_referral_on_tenant_create();

-- -------------------------------------------------------
-- 11. Trigger: log conversion/churn on subscription status change
-- -------------------------------------------------------
CREATE OR REPLACE FUNCTION log_referral_on_status_change()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER
AS $$
BEGIN
  IF NEW.referred_by_staff_code IS NOT NULL AND NEW.referred_by_staff_code != ''
     AND OLD.subscription_status != NEW.subscription_status THEN

    IF NEW.subscription_status = 'active' AND OLD.subscription_status = 'trialing' THEN
      INSERT INTO commercial_referral_events (staff_code, tenant_id, event_type, event_data)
      VALUES (NEW.referred_by_staff_code, NEW.id, 'trial_converted',
        jsonb_build_object('plan', NEW.plan, 'old_status', OLD.subscription_status));
    END IF;

    IF NEW.subscription_status IN ('canceled', 'read_only') THEN
      INSERT INTO commercial_referral_events (staff_code, tenant_id, event_type, event_data)
      VALUES (NEW.referred_by_staff_code, NEW.id, 'churned',
        jsonb_build_object('old_status', OLD.subscription_status, 'new_status', NEW.subscription_status));
    END IF;

    IF NEW.subscription_status = 'past_due' AND OLD.subscription_status = 'trialing' THEN
      INSERT INTO commercial_referral_events (staff_code, tenant_id, event_type, event_data)
      VALUES (NEW.referred_by_staff_code, NEW.id, 'trial_expired',
        jsonb_build_object('old_status', OLD.subscription_status));
    END IF;

    -- Recompute staff stats
    PERFORM recompute_staff_stats(NEW.referred_by_staff_code);
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_log_referral_on_status_change ON tenants;
CREATE TRIGGER trg_log_referral_on_status_change
  AFTER UPDATE OF subscription_status ON tenants
  FOR EACH ROW EXECUTE FUNCTION log_referral_on_status_change();
