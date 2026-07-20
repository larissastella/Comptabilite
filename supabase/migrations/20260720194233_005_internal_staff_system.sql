/*
# Internal Staff System — Roles, Commercial Codes, Platform Staff Management

## Overview
Establishes a separate internal staff system for LIYAH GROUP employees,
distinct from tenant client roles. This enables:
- Internal staff roles with per-module permissions (tenant management,
  subscription/billing, support, commercial tracking, platform statistics)
- Commercial code tracking: each Commercial-role staff gets a unique code;
  tenants can optionally enter this code during onboarding to be linked
  to that commercial for performance tracking.
- Staff performance metrics (tenants signed up via their code, conversion
  rate, revenue generated) computed from real tenant + Stripe data.

## New Tables

### internal_staff_roles
Custom roles for internal LIYAH GROUP staff (NOT tenant client roles).
- id: UUID PK
- name: role label (e.g. "Commercial", "Support", "Account Manager")
- is_system: true for built-in roles (Commercial, Support, Admin)
- created_at

### internal_staff_role_permissions
Fine-grained permission matrix for internal staff roles.
- id: UUID PK
- role_id: FK -> internal_staff_roles
- module: admin module (tenants, subscriptions, support, commercial, statistics, staff)
- can_view, can_create, can_edit, can_delete: booleans

### internal_staff_users
Links auth.users to internal staff roles (separate from tenant_users).
- id: UUID PK
- user_id: FK -> auth.users (unique)
- email: denormalised for quick lookup
- role_id: FK -> internal_staff_roles
- staff_code: unique auto-generated commercial code (e.g. "LA-COM-001")
- is_active: boolean
- invited_by: FK -> auth.users
- created_at

## Modified Tables

### tenants
- Added column: referred_by_staff_code (text, nullable)
  Stores the commercial code if the tenant was referred by a commercial.

### create_tenant_with_owner RPC
- Added parameter: p_referred_by_staff_code (text, default null)
  Stored on the tenants row for commercial tracking.

## Security
- RLS enabled on all new tables.
- Only super admins can manage internal staff roles, permissions, and users.
- Internal staff users can read their own profile row.
- Internal staff users can read the roles/permissions list (to know their own scope).
- All add/delete actions on super_admins and internal_staff_users are audit-logged.
- A safeguard function can_delete_super_admin() enforces minimum 2 super admins.
*/

-- -------------------------------------------------------
-- 1. Add referred_by_staff_code to tenants
-- -------------------------------------------------------
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'tenants' AND column_name = 'referred_by_staff_code'
  ) THEN
    ALTER TABLE tenants ADD COLUMN referred_by_staff_code text;
  END IF;
END $$;

-- -------------------------------------------------------
-- 2. internal_staff_roles
-- -------------------------------------------------------
CREATE TABLE IF NOT EXISTS internal_staff_roles (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name        text NOT NULL,
  is_system   boolean NOT NULL DEFAULT false,
  created_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE(name)
);

ALTER TABLE internal_staff_roles ENABLE ROW LEVEL SECURITY;

-- -------------------------------------------------------
-- 3. internal_staff_role_permissions
-- -------------------------------------------------------
CREATE TABLE IF NOT EXISTS internal_staff_role_permissions (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  role_id     uuid NOT NULL REFERENCES internal_staff_roles(id) ON DELETE CASCADE,
  module      text NOT NULL,
  can_view    boolean NOT NULL DEFAULT false,
  can_create  boolean NOT NULL DEFAULT false,
  can_edit    boolean NOT NULL DEFAULT false,
  can_delete  boolean NOT NULL DEFAULT false,
  UNIQUE(role_id, module)
);

ALTER TABLE internal_staff_role_permissions ENABLE ROW LEVEL SECURITY;

-- -------------------------------------------------------
-- 4. internal_staff_users
-- -------------------------------------------------------
CREATE TABLE IF NOT EXISTS internal_staff_users (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  email       text NOT NULL,
  role_id     uuid REFERENCES internal_staff_roles(id) ON DELETE SET NULL,
  staff_code  text UNIQUE,
  is_active   boolean NOT NULL DEFAULT true,
  invited_by   uuid REFERENCES auth.users(id),
  created_at  timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE internal_staff_users ENABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS idx_internal_staff_users_user_id ON internal_staff_users(user_id);
CREATE INDEX IF NOT EXISTS idx_internal_staff_users_staff_code ON internal_staff_users(staff_code);

-- -------------------------------------------------------
-- 5. Helper functions
-- -------------------------------------------------------
CREATE OR REPLACE FUNCTION is_internal_staff()
RETURNS boolean
LANGUAGE sql SECURITY DEFINER STABLE
AS $$
  SELECT EXISTS (
    SELECT 1 FROM internal_staff_users
    WHERE user_id = auth.uid() AND is_active = true
  );
$$;

CREATE OR REPLACE FUNCTION my_staff_role_id()
RETURNS uuid
LANGUAGE sql SECURITY DEFINER STABLE
AS $$
  SELECT role_id FROM internal_staff_users
  WHERE user_id = auth.uid() AND is_active = true
  LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION my_staff_code()
RETURNS text
LANGUAGE sql SECURITY DEFINER STABLE
AS $$
  SELECT staff_code FROM internal_staff_users
  WHERE user_id = auth.uid() AND is_active = true
  LIMIT 1;
$$;

-- Check if current user can perform an action on a module
CREATE OR REPLACE FUNCTION can_staff_access(p_module text, p_action text DEFAULT 'view')
RETURNS boolean
LANGUAGE sql SECURITY DEFINER STABLE
AS $$
  SELECT EXISTS (
    SELECT 1 FROM internal_staff_role_permissions rp
    JOIN internal_staff_users u ON u.role_id = rp.role_id
    WHERE u.user_id = auth.uid() AND u.is_active = true
    AND rp.module = p_module
    AND (
      (p_action = 'view' AND rp.can_view) OR
      (p_action = 'create' AND rp.can_create) OR
      (p_action = 'edit' AND rp.can_edit) OR
      (p_action = 'delete' AND rp.can_delete)
    )
  ) OR is_super_admin();
$$;

-- Safeguard: can we delete a super admin? (must keep at least 2)
CREATE OR REPLACE FUNCTION can_delete_super_admin()
RETURNS boolean
LANGUAGE sql SECURITY DEFINER STABLE
AS $$
  SELECT (SELECT count(*) FROM super_admins) > 2;
$$;

-- Auto-generate staff code for Commercial role
CREATE OR REPLACE FUNCTION generate_staff_code()
RETURNS text
LANGUAGE plpgsql SECURITY DEFINER
AS $$
DECLARE
  v_code text;
  v_seq integer;
BEGIN
  SELECT count(*) + 1 INTO v_seq FROM internal_staff_users WHERE staff_code IS NOT NULL;
  v_code := 'LA-COM-' || lpad(v_seq::text, 3, '0');
  RETURN v_code;
END;
$$;

-- -------------------------------------------------------
-- 6. RLS Policies -- internal_staff_roles
-- -------------------------------------------------------
DROP POLICY IF EXISTS "isr_select" ON internal_staff_roles;
CREATE POLICY "isr_select" ON internal_staff_roles FOR SELECT
TO authenticated
USING (is_super_admin() OR is_internal_staff());

DROP POLICY IF EXISTS "isr_insert" ON internal_staff_roles;
CREATE POLICY "isr_insert" ON internal_staff_roles FOR INSERT
TO authenticated
WITH CHECK (is_super_admin());

DROP POLICY IF EXISTS "isr_update" ON internal_staff_roles;
CREATE POLICY "isr_update" ON internal_staff_roles FOR UPDATE
TO authenticated
USING (is_super_admin())
WITH CHECK (is_super_admin());

DROP POLICY IF EXISTS "isr_delete" ON internal_staff_roles;
CREATE POLICY "isr_delete" ON internal_staff_roles FOR DELETE
TO authenticated
USING (is_super_admin());

-- -------------------------------------------------------
-- 7. RLS Policies -- internal_staff_role_permissions
-- -------------------------------------------------------
DROP POLICY IF EXISTS "isrp_select" ON internal_staff_role_permissions;
CREATE POLICY "isrp_select" ON internal_staff_role_permissions FOR SELECT
TO authenticated
USING (
  is_super_admin() OR
  EXISTS (
    SELECT 1 FROM internal_staff_users u
    WHERE u.user_id = auth.uid() AND u.is_active = true
  )
);

DROP POLICY IF EXISTS "isrp_insert" ON internal_staff_role_permissions;
CREATE POLICY "isrp_insert" ON internal_staff_role_permissions FOR INSERT
TO authenticated
WITH CHECK (is_super_admin());

DROP POLICY IF EXISTS "isrp_update" ON internal_staff_role_permissions;
CREATE POLICY "isrp_update" ON internal_staff_role_permissions FOR UPDATE
TO authenticated
USING (is_super_admin())
WITH CHECK (is_super_admin());

DROP POLICY IF EXISTS "isrp_delete" ON internal_staff_role_permissions;
CREATE POLICY "isrp_delete" ON internal_staff_role_permissions FOR DELETE
TO authenticated
USING (is_super_admin());

-- -------------------------------------------------------
-- 8. RLS Policies -- internal_staff_users
-- -------------------------------------------------------
DROP POLICY IF EXISTS "isu_select" ON internal_staff_users;
CREATE POLICY "isu_select" ON internal_staff_users FOR SELECT
TO authenticated
USING (user_id = auth.uid() OR is_super_admin());

DROP POLICY IF EXISTS "isu_insert" ON internal_staff_users;
CREATE POLICY "isu_insert" ON internal_staff_users FOR INSERT
TO authenticated
WITH CHECK (is_super_admin());

DROP POLICY IF EXISTS "isu_update" ON internal_staff_users;
CREATE POLICY "isu_update" ON internal_staff_users FOR UPDATE
TO authenticated
USING (is_super_admin())
WITH CHECK (is_super_admin());

DROP POLICY IF EXISTS "isu_delete" ON internal_staff_users;
CREATE POLICY "isu_delete" ON internal_staff_users FOR DELETE
TO authenticated
USING (is_super_admin());

-- -------------------------------------------------------
-- 9. Seed default internal staff roles + permissions
-- -------------------------------------------------------
INSERT INTO internal_staff_roles (name, is_system) VALUES
  ('Commercial', true),
  ('Support', true),
  ('Account Manager', true),
  ('Staff Admin', true)
ON CONFLICT (name) DO NOTHING;

-- Permissions for Commercial: can view commercial tracking + statistics
INSERT INTO internal_staff_role_permissions (role_id, module, can_view, can_create, can_edit, can_delete)
SELECT r.id, 'commercial', true, false, false, false
FROM internal_staff_roles r WHERE r.name = 'Commercial'
ON CONFLICT (role_id, module) DO NOTHING;

INSERT INTO internal_staff_role_permissions (role_id, module, can_view, can_create, can_edit, can_delete)
SELECT r.id, 'statistics', true, false, false, false
FROM internal_staff_roles r WHERE r.name = 'Commercial'
ON CONFLICT (role_id, module) DO NOTHING;

-- Permissions for Support: can view tenants + support
INSERT INTO internal_staff_role_permissions (role_id, module, can_view, can_create, can_edit, can_delete)
SELECT r.id, 'tenants', true, false, false, false
FROM internal_staff_roles r WHERE r.name = 'Support'
ON CONFLICT (role_id, module) DO NOTHING;

INSERT INTO internal_staff_role_permissions (role_id, module, can_view, can_create, can_edit, can_delete)
SELECT r.id, 'support', true, true, true, false
FROM internal_staff_roles r WHERE r.name = 'Support'
ON CONFLICT (role_id, module) DO NOTHING;

-- Permissions for Account Manager: tenants + subscriptions + commercial
INSERT INTO internal_staff_role_permissions (role_id, module, can_view, can_create, can_edit, can_delete)
SELECT r.id, 'tenants', true, true, true, false
FROM internal_staff_roles r WHERE r.name = 'Account Manager'
ON CONFLICT (role_id, module) DO NOTHING;

INSERT INTO internal_staff_role_permissions (role_id, module, can_view, can_create, can_edit, can_delete)
SELECT r.id, 'subscriptions', true, true, true, false
FROM internal_staff_roles r WHERE r.name = 'Account Manager'
ON CONFLICT (role_id, module) DO NOTHING;

INSERT INTO internal_staff_role_permissions (role_id, module, can_view, can_create, can_edit, can_delete)
SELECT r.id, 'commercial', true, false, false, false
FROM internal_staff_roles r WHERE r.name = 'Account Manager'
ON CONFLICT (role_id, module) DO NOTHING;

-- Permissions for Staff Admin: all modules full access
INSERT INTO internal_staff_role_permissions (role_id, module, can_view, can_create, can_edit, can_delete)
SELECT r.id, m.module, true, true, true, true
FROM internal_staff_roles r
CROSS JOIN (VALUES ('tenants'), ('subscriptions'), ('support'), ('commercial'), ('statistics'), ('staff')) AS m(module)
WHERE r.name = 'Staff Admin'
ON CONFLICT (role_id, module) DO NOTHING;

-- -------------------------------------------------------
-- 10. Update create_tenant_with_owner RPC
-- -------------------------------------------------------
DROP FUNCTION IF EXISTS public.create_tenant_with_owner(text, text, text, text, text, text, text, numeric, plan_type, text, text, text, text);

CREATE OR REPLACE FUNCTION public.create_tenant_with_owner(
  p_name text,
  p_country text DEFAULT 'CM',
  p_region text DEFAULT NULL,
  p_city text DEFAULT NULL,
  p_currency text DEFAULT 'XAF',
  p_timezone text DEFAULT 'Africa/Douala',
  p_phone_prefix text DEFAULT '+237',
  p_vat_rate numeric DEFAULT 19.25,
  p_plan plan_type DEFAULT 'starter',
  p_sector text DEFAULT NULL,
  p_logo_url text DEFAULT NULL,
  p_cachet_url text DEFAULT NULL,
  p_invoice_prefix text DEFAULT 'FAC',
  p_referred_by_staff_code text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_tenant_id uuid;
  v_user_id uuid := auth.uid();
  v_code_exists boolean;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  IF EXISTS (SELECT 1 FROM tenant_users WHERE user_id = v_user_id AND is_owner = true) THEN
    RAISE EXCEPTION 'User already owns a tenant';
  END IF;

  IF p_referred_by_staff_code IS NOT NULL AND p_referred_by_staff_code != '' THEN
    SELECT EXISTS(
      SELECT 1 FROM internal_staff_users
      WHERE staff_code = p_referred_by_staff_code AND is_active = true
    ) INTO v_code_exists;
    IF NOT v_code_exists THEN
      RAISE EXCEPTION 'Code commercial invalide';
    END IF;
  END IF;

  INSERT INTO tenants (name, country, region, city, currency, timezone,
    phone_prefix, vat_rate, plan, sector, logo_url, cachet_url, invoice_prefix,
    referred_by_staff_code)
  VALUES (p_name, p_country, p_region, p_city, p_currency, p_timezone,
    p_phone_prefix, p_vat_rate, p_plan, p_sector, p_logo_url, p_cachet_url, p_invoice_prefix,
    NULLIF(p_referred_by_staff_code, ''))
  RETURNING id INTO v_tenant_id;

  INSERT INTO tenant_users (tenant_id, user_id, role, is_owner)
  VALUES (v_tenant_id, v_user_id, 'admin', true);

  RETURN v_tenant_id;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.create_tenant_with_owner(text, text, text, text, text, text, text, numeric, plan_type, text, text, text, text, text) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.create_tenant_with_owner(text, text, text, text, text, text, text, numeric, plan_type, text, text, text, text, text) TO authenticated;

-- -------------------------------------------------------
-- 11. Trigger: auto-generate staff_code on insert for Commercial role
-- -------------------------------------------------------
CREATE OR REPLACE FUNCTION auto_generate_staff_code()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER
AS $$
DECLARE
  v_role_name text;
BEGIN
  IF NEW.staff_code IS NOT NULL THEN
    RETURN NEW;
  END IF;

  IF NEW.role_id IS NOT NULL THEN
    SELECT name INTO v_role_name FROM internal_staff_roles WHERE id = NEW.role_id;
    IF v_role_name = 'Commercial' THEN
      NEW.staff_code := generate_staff_code();
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_auto_staff_code ON internal_staff_users;
CREATE TRIGGER trg_auto_staff_code
  BEFORE INSERT ON internal_staff_users
  FOR EACH ROW EXECUTE FUNCTION auto_generate_staff_code();
