/*
# Re-synchronise la liste blanche super admin

Le trigger handle_super_admin_signup() n'octroie le statut super admin
qu'AU MOMENT de l'inscription. Le backfill des migrations 019 et 032 ne
rattrapait que les comptes qui existaient déjà à l'instant précis où ces
migrations ont tourné — tout compte créé APRÈS coup avec un email de la
liste blanche (super_admin_emails) n'a jamais été rattrapé, et se
retrouve avec "Forbidden — super admin only" sur toutes les actions
d'admin-manage (visible dans l'app en cliquant "Étendre" sur un tenant,
mais en réalité sur N'IMPORTE QUELLE action du panneau Super Admin/Staff)
sans que rien ne l'indique clairement dans l'interface.

Cette migration relance le même rattrapage, insensible à la casse comme
la 032, pour couvrir tout compte créé depuis. Sans effet si tout le monde
est déjà à jour (ON CONFLICT DO NOTHING) — sans risque à ré-exécuter.

Fix réel du symptôme, pas seulement pour aujourd'hui: idéalement ce
rattrapage devrait tourner à chaque inscription et pas seulement au
moment des migrations — voir la suggestion dans le commit associé pour
un correctif structurel (vérifier au login plutôt qu'au signup).
*/

INSERT INTO super_admins (user_id, email)
SELECT u.id, u.email
FROM auth.users u
JOIN super_admin_emails sae ON lower(sae.email) = lower(u.email)
ON CONFLICT (user_id) DO NOTHING;

-- Structural fix, not just a one-time catch-up: the trigger only ever
-- grants at signup, so the moment someone is added to the whitelist
-- AFTER their account already exists, they stay locked out until a human
-- notices and runs a migration like this one by hand — as just happened.
-- This lets the client call it for its own logged-in user right after
-- login (see AuthContext.tsx), so being on the whitelist is enough,
-- whenever it happened relative to signup, with no manual step. Callable
-- by anyone, but SECURITY DEFINER + auth.uid() means it can only ever
-- grant the CALLER their own already-whitelisted status — never anyone
-- else's, and never anyone not already on super_admin_emails.
CREATE OR REPLACE FUNCTION public.sync_own_super_admin_status()
RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  is_whitelisted boolean;
BEGIN
  SELECT EXISTS (
    SELECT 1 FROM super_admin_emails sae
    JOIN auth.users u ON lower(sae.email) = lower(u.email)
    WHERE u.id = auth.uid()
  ) INTO is_whitelisted;

  IF is_whitelisted THEN
    INSERT INTO super_admins (user_id, email)
    SELECT auth.uid(), email FROM auth.users WHERE id = auth.uid()
    ON CONFLICT (user_id) DO NOTHING;
  END IF;

  RETURN EXISTS (SELECT 1 FROM super_admins WHERE user_id = auth.uid());
END;
$$;

GRANT EXECUTE ON FUNCTION public.sync_own_super_admin_status() TO authenticated;
