/*
# Correctif: octroi du statut super admin sensible à la casse

Le trigger `handle_super_admin_signup()` (et le backfill de la migration
019) comparaient les emails avec `=` — une comparaison EXACTE, sensible
à la casse. Si un super admin s'est inscrit avec une casse différente de
celle enregistrée dans `super_admin_emails` (ex: `WebDXB1@gmail.com` vs
`webdxb1@gmail.com`), la correspondance échoue silencieusement: pas
d'erreur, pas de log — juste aucun octroi. Symptôme observé: le module
Super Admin n'apparaît pas dans l'interface après connexion, alors que
l'email figure bien dans la liste blanche.

Cette migration:
1. Corrige le trigger pour comparer les emails insensiblement à la casse
   (lower() des deux côtés) — s'applique à tous les futurs signups.
2. Re-lance le backfill avec la même comparaison insensible à la casse,
   pour rattraper tout compte déjà existant qui aurait été manqué par le
   backfill précédent (sensible à la casse) de la migration 019.
*/

CREATE OR REPLACE FUNCTION public.handle_super_admin_signup()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  BEGIN
    IF EXISTS (
      SELECT 1 FROM public.super_admin_emails WHERE lower(email) = lower(NEW.email)
    ) THEN
      INSERT INTO public.super_admins (user_id, email)
      VALUES (NEW.id, NEW.email)
      ON CONFLICT (user_id) DO NOTHING;
    END IF;
  EXCEPTION WHEN OTHERS THEN
    -- Non-fatal: never block user creation
    NULL;
  END;
  RETURN NEW;
END;
$$;

-- Rattrape tout compte déjà existant qui matchait la liste blanche à la
-- casse près, mais que le backfill précédent (sensible à la casse) avait
-- manqué.
INSERT INTO super_admins (user_id, email)
SELECT u.id, u.email
FROM auth.users u
JOIN super_admin_emails sae ON lower(sae.email) = lower(u.email)
ON CONFLICT (user_id) DO NOTHING;
