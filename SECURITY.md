# Security — Multi-Tenant Isolation

## How tenant isolation is enforced

Every business table has a `tenant_id` column and Row Level Security (RLS) is
**enabled** on every table. RLS is enforced at the Postgres level — it cannot
be bypassed by the frontend, even if a user manually edits a request or an ID
in the URL.

### Policy pattern

All tenant-scoped tables use the same helper functions:

- `is_tenant_member(tenant_id)` — returns true if `auth.uid()` appears in
  `tenant_users` for that tenant.
- `is_tenant_admin(tenant_id)` — same, but requires `role = 'admin'`.
- `is_super_admin()` — returns true if `auth.uid()` is in `super_admins`.

Typical policies (per table):

| Command | USING (read filter)              | WITH CHECK (write validation)            |
|--------|----------------------------------|------------------------------------------|
| SELECT | `is_tenant_member(tenant_id) OR is_super_admin()` | —                              |
| INSERT | —                                | `is_tenant_member(tenant_id)`            |
| UPDATE | `is_tenant_member(tenant_id)`    | `is_tenant_member(tenant_id)`            |
| DELETE | `is_tenant_admin(tenant_id)`     | —                                        |

A user from Tenant A therefore:

- **Cannot read** Tenant B's rows — SELECT returns 0 rows for `tenant_id` they
  are not a member of.
- **Cannot write** to Tenant B — INSERT/UPDATE fail the `WITH CHECK` clause.
- **Cannot escalate** into Tenant B — `tenant_users` INSERT requires
  `is_tenant_admin(tenant_id)`, so a user cannot add themselves to a tenant
  they don't already administer.

### Onboarding (first-tenant creation)

A brand-new user has no `tenant_users` row, so the strict INSERT policy would
block them from creating their first tenant. This is solved by a SECURITY
DEFINER function `create_tenant_with_owner(...)` that:

1. Inserts the new `tenants` row.
2. Inserts the `tenant_users` owner row for `auth.uid()` only.
3. Rejects if the user already owns a tenant (prevents second-tenant abuse).

The frontend onboarding calls this RPC instead of doing two separate inserts.

### Super Admin

`is_super_admin()` returns true only for users listed in `super_admins`. The
table is populated by a trigger on `auth.users` that matches the signup email
against `super_admin_emails` (a seed table readable only by super admins).

Super admins can read all tenants' data (USING clause on every SELECT policy)
and can update/delete any tenant. Cross-tenant writes by super admins are
audited via `audit_logs`.

### Verified by test

The isolation was tested with two synthetic tenants (A and B) and two users:

- Tenant A user reads `customers` → sees only Customer A1. ✅
- Tenant A user reads Tenant B's customer by ID → 0 rows. ✅
- Tenant A user inserts a customer with `tenant_id = B` → blocked by RLS. ✅
- Tenant A user updates Tenant B's customer by ID → 0 rows affected. ✅
- Tenant A user inserts into `tenant_users` to join Tenant B → blocked. ✅

## What the frontend does not rely on

The frontend filters queries by `tenant_id` for convenience, but this is
**not** the security boundary. Even if a user removes the filter or edits an
ID in a URL, Postgres RLS rejects the request server-side. The frontend filter
is for performance and UX, not for security.
