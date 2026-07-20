
/*
# LiAfrik Books — Core Multi-Tenant Schema

## Overview
Establishes the fundamental multi-tenant architecture for LiAfrik Books, an African-first
SaaS accounting platform. Every tenant (company) is fully isolated via Row Level Security.

## New Tables

### tenants
The root entity. One row = one company/organisation.
- id: UUID primary key
- name: company name
- country: ISO country code (e.g. CM, SN, NG, KE)
- region, city: geographical sub-division
- currency: ISO currency code — immutable after initial setup (XAF, XOF, NGN, KES, USD…)
- timezone: IANA timezone string
- phone_prefix: e.g. +237
- plan: enum (starter|pro|premium|enterprise)
- subscription_status: enum (trialing|active|past_due|canceled|read_only)
- trial_ends_at: timestamp when 7-day trial expires
- stripe_customer_id, stripe_subscription_id: Stripe refs
- logo_url, cachet_url: uploaded via Supabase Storage
- vat_rate: default VAT % for this tenant (configurable)
- legal_rccm, legal_nif, legal_regime: legal invoice fields
- bank_details: jsonb free-form bank/mobile-money info
- sector: business sector/NAF code
- created_at, updated_at

### tenant_users
Junction table linking auth.users to tenants, with a role.
- id: UUID PK
- tenant_id: FK → tenants
- user_id: FK → auth.users
- role: text role name (admin|accountant|sales|cashier or custom)
- is_owner: boolean — the user who created the tenant
- invited_by: FK → auth.users
- created_at

### super_admins
Platform-level admins (not tied to any tenant).
- id: UUID PK
- user_id: FK → auth.users (unique)
- email: denormalised for quick lookup
- added_by: FK → auth.users (who granted super-admin)
- created_at

### roles
Custom roles defined per tenant.
- id UUID PK
- tenant_id FK → tenants
- name: role label
- is_system: true for built-in roles (admin, accountant, sales, cashier)
- created_at

### role_permissions
Fine-grained permission matrix (module × verb).
- id UUID PK
- role_id FK → roles
- module: e.g. invoices, inventory, reports, settings
- can_view, can_create, can_edit, can_delete: booleans

### audit_logs
Immutable audit trail — every significant action.
- id UUID PK
- tenant_id FK → tenants (nullable for super-admin actions)
- user_id FK → auth.users
- action: short verb (create, update, delete, login, impersonate…)
- module: affected module
- record_id: affected record UUID (nullable)
- before_data, after_data: jsonb snapshots
- ip_address, user_agent
- created_at (no update allowed)

## Security
- RLS enabled on all tables
- tenant_users: users can only see rows where user_id = auth.uid() or they are admin of the tenant
- tenants: user can see their own tenant via tenant_users membership
- super_admins: only super admins can read this table
- audit_logs: tenant members can read their own tenant's logs; super admins see all
- roles / role_permissions: readable by tenant members, writable by tenant admin
*/

-- -------------------------------------------------------
-- ENUM types
-- -------------------------------------------------------
DO $$ BEGIN
  CREATE TYPE plan_type AS ENUM ('starter','pro','premium','enterprise');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE subscription_status AS ENUM ('trialing','active','past_due','canceled','read_only');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- -------------------------------------------------------
-- tenants
-- -------------------------------------------------------
CREATE TABLE IF NOT EXISTS tenants (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name                  text NOT NULL,
  country               text NOT NULL DEFAULT 'CM',
  region                text,
  city                  text,
  currency              text NOT NULL DEFAULT 'XAF',
  timezone              text NOT NULL DEFAULT 'Africa/Douala',
  phone_prefix          text NOT NULL DEFAULT '+237',
  plan                  plan_type NOT NULL DEFAULT 'starter',
  subscription_status   subscription_status NOT NULL DEFAULT 'trialing',
  trial_ends_at         timestamptz NOT NULL DEFAULT (now() + interval '7 days'),
  stripe_customer_id    text,
  stripe_subscription_id text,
  logo_url              text,
  cachet_url            text,
  vat_rate              numeric(5,2) NOT NULL DEFAULT 19.25,
  legal_rccm            text,
  legal_nif             text,
  legal_regime          text,
  bank_details          jsonb DEFAULT '{}',
  sector                text,
  invoice_prefix        text NOT NULL DEFAULT 'FAC',
  invoice_counter       integer NOT NULL DEFAULT 0,
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE tenants ENABLE ROW LEVEL SECURITY;

-- -------------------------------------------------------
-- tenant_users
-- -------------------------------------------------------
CREATE TABLE IF NOT EXISTS tenant_users (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  user_id     uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role        text NOT NULL DEFAULT 'admin',
  is_owner    boolean NOT NULL DEFAULT false,
  invited_by  uuid REFERENCES auth.users(id),
  created_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE(tenant_id, user_id)
);

ALTER TABLE tenant_users ENABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS idx_tenant_users_user_id ON tenant_users(user_id);
CREATE INDEX IF NOT EXISTS idx_tenant_users_tenant_id ON tenant_users(tenant_id);

-- -------------------------------------------------------
-- super_admins
-- -------------------------------------------------------
CREATE TABLE IF NOT EXISTS super_admins (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  email       text NOT NULL,
  added_by    uuid REFERENCES auth.users(id),
  created_at  timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE super_admins ENABLE ROW LEVEL SECURITY;

-- -------------------------------------------------------
-- roles
-- -------------------------------------------------------
CREATE TABLE IF NOT EXISTS roles (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  name        text NOT NULL,
  is_system   boolean NOT NULL DEFAULT false,
  created_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE(tenant_id, name)
);

ALTER TABLE roles ENABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS idx_roles_tenant_id ON roles(tenant_id);

-- -------------------------------------------------------
-- role_permissions
-- -------------------------------------------------------
CREATE TABLE IF NOT EXISTS role_permissions (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  role_id     uuid NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
  module      text NOT NULL,
  can_view    boolean NOT NULL DEFAULT false,
  can_create  boolean NOT NULL DEFAULT false,
  can_edit    boolean NOT NULL DEFAULT false,
  can_delete  boolean NOT NULL DEFAULT false,
  UNIQUE(role_id, module)
);

ALTER TABLE role_permissions ENABLE ROW LEVEL SECURITY;

-- -------------------------------------------------------
-- audit_logs
-- -------------------------------------------------------
CREATE TABLE IF NOT EXISTS audit_logs (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   uuid REFERENCES tenants(id) ON DELETE SET NULL,
  user_id     uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  action      text NOT NULL,
  module      text NOT NULL,
  record_id   uuid,
  before_data jsonb,
  after_data  jsonb,
  ip_address  text,
  user_agent  text,
  created_at  timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS idx_audit_logs_tenant_id ON audit_logs(tenant_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_created_at ON audit_logs(created_at DESC);

-- -------------------------------------------------------
-- Helper function: is current user a super admin?
-- -------------------------------------------------------
CREATE OR REPLACE FUNCTION is_super_admin()
RETURNS boolean
LANGUAGE sql SECURITY DEFINER STABLE
AS $$
  SELECT EXISTS (
    SELECT 1 FROM super_admins WHERE user_id = auth.uid()
  );
$$;

-- Helper: get tenant_id for current user (first active tenant)
CREATE OR REPLACE FUNCTION my_tenant_id()
RETURNS uuid
LANGUAGE sql SECURITY DEFINER STABLE
AS $$
  SELECT tenant_id FROM tenant_users WHERE user_id = auth.uid() LIMIT 1;
$$;

-- Helper: is current user a member of a given tenant?
CREATE OR REPLACE FUNCTION is_tenant_member(tid uuid)
RETURNS boolean
LANGUAGE sql SECURITY DEFINER STABLE
AS $$
  SELECT EXISTS (
    SELECT 1 FROM tenant_users WHERE tenant_id = tid AND user_id = auth.uid()
  );
$$;

-- Helper: is current user admin of a given tenant?
CREATE OR REPLACE FUNCTION is_tenant_admin(tid uuid)
RETURNS boolean
LANGUAGE sql SECURITY DEFINER STABLE
AS $$
  SELECT EXISTS (
    SELECT 1 FROM tenant_users WHERE tenant_id = tid AND user_id = auth.uid() AND role = 'admin'
  );
$$;

-- -------------------------------------------------------
-- RLS POLICIES — tenants
-- -------------------------------------------------------
DROP POLICY IF EXISTS "tenant_select" ON tenants;
CREATE POLICY "tenant_select" ON tenants FOR SELECT
TO authenticated
USING (is_tenant_member(id) OR is_super_admin());

DROP POLICY IF EXISTS "tenant_insert" ON tenants;
CREATE POLICY "tenant_insert" ON tenants FOR INSERT
TO authenticated
WITH CHECK (true); -- user creates their own tenant on signup

DROP POLICY IF EXISTS "tenant_update" ON tenants;
CREATE POLICY "tenant_update" ON tenants FOR UPDATE
TO authenticated
USING (is_tenant_admin(id) OR is_super_admin())
WITH CHECK (is_tenant_admin(id) OR is_super_admin());

DROP POLICY IF EXISTS "tenant_delete" ON tenants;
CREATE POLICY "tenant_delete" ON tenants FOR DELETE
TO authenticated
USING (is_super_admin());

-- -------------------------------------------------------
-- RLS POLICIES — tenant_users
-- -------------------------------------------------------
DROP POLICY IF EXISTS "tu_select" ON tenant_users;
CREATE POLICY "tu_select" ON tenant_users FOR SELECT
TO authenticated
USING (user_id = auth.uid() OR is_tenant_member(tenant_id) OR is_super_admin());

DROP POLICY IF EXISTS "tu_insert" ON tenant_users;
CREATE POLICY "tu_insert" ON tenant_users FOR INSERT
TO authenticated
WITH CHECK (is_tenant_admin(tenant_id) OR is_super_admin() OR user_id = auth.uid());

DROP POLICY IF EXISTS "tu_update" ON tenant_users;
CREATE POLICY "tu_update" ON tenant_users FOR UPDATE
TO authenticated
USING (is_tenant_admin(tenant_id) OR is_super_admin())
WITH CHECK (is_tenant_admin(tenant_id) OR is_super_admin());

DROP POLICY IF EXISTS "tu_delete" ON tenant_users;
CREATE POLICY "tu_delete" ON tenant_users FOR DELETE
TO authenticated
USING (is_tenant_admin(tenant_id) OR is_super_admin());

-- -------------------------------------------------------
-- RLS POLICIES — super_admins
-- -------------------------------------------------------
DROP POLICY IF EXISTS "sa_select" ON super_admins;
CREATE POLICY "sa_select" ON super_admins FOR SELECT
TO authenticated
USING (is_super_admin());

DROP POLICY IF EXISTS "sa_insert" ON super_admins;
CREATE POLICY "sa_insert" ON super_admins FOR INSERT
TO authenticated
WITH CHECK (is_super_admin());

DROP POLICY IF EXISTS "sa_delete" ON super_admins;
CREATE POLICY "sa_delete" ON super_admins FOR DELETE
TO authenticated
USING (is_super_admin());

-- -------------------------------------------------------
-- RLS POLICIES — roles
-- -------------------------------------------------------
DROP POLICY IF EXISTS "roles_select" ON roles;
CREATE POLICY "roles_select" ON roles FOR SELECT
TO authenticated
USING (is_tenant_member(tenant_id) OR is_super_admin());

DROP POLICY IF EXISTS "roles_insert" ON roles;
CREATE POLICY "roles_insert" ON roles FOR INSERT
TO authenticated
WITH CHECK (is_tenant_admin(tenant_id));

DROP POLICY IF EXISTS "roles_update" ON roles;
CREATE POLICY "roles_update" ON roles FOR UPDATE
TO authenticated
USING (is_tenant_admin(tenant_id))
WITH CHECK (is_tenant_admin(tenant_id));

DROP POLICY IF EXISTS "roles_delete" ON roles;
CREATE POLICY "roles_delete" ON roles FOR DELETE
TO authenticated
USING (is_tenant_admin(tenant_id) AND NOT is_system);

-- -------------------------------------------------------
-- RLS POLICIES — role_permissions
-- -------------------------------------------------------
DROP POLICY IF EXISTS "rp_select" ON role_permissions;
CREATE POLICY "rp_select" ON role_permissions FOR SELECT
TO authenticated
USING (EXISTS (SELECT 1 FROM roles r WHERE r.id = role_id AND is_tenant_member(r.tenant_id)));

DROP POLICY IF EXISTS "rp_insert" ON role_permissions;
CREATE POLICY "rp_insert" ON role_permissions FOR INSERT
TO authenticated
WITH CHECK (EXISTS (SELECT 1 FROM roles r WHERE r.id = role_id AND is_tenant_admin(r.tenant_id)));

DROP POLICY IF EXISTS "rp_update" ON role_permissions;
CREATE POLICY "rp_update" ON role_permissions FOR UPDATE
TO authenticated
USING (EXISTS (SELECT 1 FROM roles r WHERE r.id = role_id AND is_tenant_admin(r.tenant_id)));

DROP POLICY IF EXISTS "rp_delete" ON role_permissions;
CREATE POLICY "rp_delete" ON role_permissions FOR DELETE
TO authenticated
USING (EXISTS (SELECT 1 FROM roles r WHERE r.id = role_id AND is_tenant_admin(r.tenant_id)));

-- -------------------------------------------------------
-- RLS POLICIES — audit_logs
-- -------------------------------------------------------
DROP POLICY IF EXISTS "al_select" ON audit_logs;
CREATE POLICY "al_select" ON audit_logs FOR SELECT
TO authenticated
USING (is_tenant_member(tenant_id) OR is_super_admin());

DROP POLICY IF EXISTS "al_insert" ON audit_logs;
CREATE POLICY "al_insert" ON audit_logs FOR INSERT
TO authenticated
WITH CHECK (true); -- anyone authenticated can write audit logs

-- No update or delete on audit_logs — they are immutable

-- -------------------------------------------------------
-- Seed: Super Admins
-- -------------------------------------------------------
-- These are inserted lazily: we store the emails, and when the user
-- with that email registers, a trigger will grant them super_admin.
CREATE TABLE IF NOT EXISTS super_admin_emails (
  email text PRIMARY KEY
);

INSERT INTO super_admin_emails (email) VALUES
  ('vincentnogue2@gmail.com'),
  ('vincentnogue@yahoo.com'),
  ('larissadjomguem@gmail.com')
ON CONFLICT (email) DO NOTHING;

ALTER TABLE super_admin_emails ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "sae_select" ON super_admin_emails;
CREATE POLICY "sae_select" ON super_admin_emails FOR SELECT
TO authenticated USING (is_super_admin());

-- Trigger: when a new user signs up, auto-grant super_admin if email matches
CREATE OR REPLACE FUNCTION handle_super_admin_signup()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER
AS $$
BEGIN
  IF EXISTS (SELECT 1 FROM super_admin_emails WHERE email = NEW.email) THEN
    INSERT INTO super_admins (user_id, email)
    VALUES (NEW.id, NEW.email)
    ON CONFLICT (user_id) DO NOTHING;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created_super_admin ON auth.users;
CREATE TRIGGER on_auth_user_created_super_admin
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION handle_super_admin_signup();

-- updated_at trigger for tenants
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$;

DROP TRIGGER IF EXISTS tenants_updated_at ON tenants;
CREATE TRIGGER tenants_updated_at
  BEFORE UPDATE ON tenants
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();
