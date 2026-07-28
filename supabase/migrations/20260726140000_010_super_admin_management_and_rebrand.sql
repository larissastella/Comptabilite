/*
# Super admin allowlist update

The add/remove-super-admin UI already exists and works (via the
`admin-manage` edge function, actions `add-super-admin` / `delete-super-admin`),
including the "at least 2 must remain" floor protection. This migration
only updates the seed allowlist used to auto-grant super_admin on signup,
and grants it immediately to any of those emails that already have an
account (the auto-grant trigger only fires for *new* signups).
*/

-- 1. Replace the seed list
DELETE FROM super_admin_emails WHERE email = 'larissadjomguem@gmail.com';
INSERT INTO super_admin_emails (email) VALUES
  ('vincentnogue2@gmail.com'),
  ('vincentnogue@yahoo.com'),
  ('liyahjoha@gmail.com'),
  ('webdxb1@gmail.com')
ON CONFLICT (email) DO NOTHING;

-- 2. Grant immediately to matching accounts that already exist
INSERT INTO super_admins (user_id, email)
SELECT u.id, u.email
FROM auth.users u
JOIN super_admin_emails sae ON lower(sae.email) = lower(u.email)
ON CONFLICT (user_id) DO NOTHING;

-- 3. Let the admin-manage edge function (service role) keep
-- super_admin_emails in sync too when admins are added/removed from the
-- UI, so a removed admin can't silently get re-granted by re-signing up
-- with the same email, and a newly-added admin who hasn't signed up yet
-- can still be pre-authorized. INSERT/DELETE policies for authenticated
-- super admins as a safety net (service role bypasses RLS regardless).
DROP POLICY IF EXISTS "sae_insert" ON super_admin_emails;
CREATE POLICY "sae_insert" ON super_admin_emails FOR INSERT TO authenticated
  WITH CHECK (is_super_admin());
DROP POLICY IF EXISTS "sae_delete" ON super_admin_emails;
CREATE POLICY "sae_delete" ON super_admin_emails FOR DELETE TO authenticated
  USING (is_super_admin());
