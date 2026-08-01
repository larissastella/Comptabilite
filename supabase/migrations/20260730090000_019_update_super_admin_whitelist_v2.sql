/*
# Update super admin whitelist (5 emails)

Requested list: webdxb1@gmail.com, vincentnogue2@gmail.com,
vincentnogue@yahoo.com, liyahjoha@yahoo.com, liyahjoha@gmail.com
*/

INSERT INTO super_admin_emails (email) VALUES
  ('webdxb1@gmail.com'),
  ('vincentnogue2@gmail.com'),
  ('vincentnogue@yahoo.com'),
  ('liyahjoha@yahoo.com'),
  ('liyahjoha@gmail.com')
ON CONFLICT (email) DO NOTHING;

-- Backfill: grant super_admin to any of these emails that already has an
-- account today (the auto-grant trigger only fires for NEW signups).
INSERT INTO super_admins (user_id, email)
SELECT u.id, u.email
FROM auth.users u
JOIN super_admin_emails sae ON sae.email = u.email
ON CONFLICT (user_id) DO NOTHING;
