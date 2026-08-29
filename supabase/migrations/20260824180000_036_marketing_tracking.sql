/*
# Suivi de performance pour le contenu marketing

Ajoute des compteurs d'impressions et de clics à marketing_content, avec
deux fonctions SECURITY DEFINER pour les incrémenter en toute sécurité
depuis un visiteur anonyme (le site public n'a pas de session
authentifiée classique, donc pas question de lui donner un accès UPDATE
direct sur la table — juste le droit d'incrémenter un compteur, rien
d'autre).
*/

ALTER TABLE marketing_content ADD COLUMN IF NOT EXISTS impressions integer NOT NULL DEFAULT 0;
ALTER TABLE marketing_content ADD COLUMN IF NOT EXISTS clicks integer NOT NULL DEFAULT 0;

CREATE OR REPLACE FUNCTION record_marketing_impression(p_id uuid)
RETURNS void
LANGUAGE sql SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  UPDATE marketing_content SET impressions = impressions + 1 WHERE id = p_id AND is_active = true;
$$;

CREATE OR REPLACE FUNCTION record_marketing_click(p_id uuid)
RETURNS void
LANGUAGE sql SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  UPDATE marketing_content SET clicks = clicks + 1 WHERE id = p_id AND is_active = true;
$$;

-- Anyone (including anonymous visitors on the public landing page) can
-- call these — they only ever increment a counter on an ALREADY-ACTIVE
-- row, nothing else is readable/writable through them.
GRANT EXECUTE ON FUNCTION record_marketing_impression(uuid) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION record_marketing_click(uuid) TO anon, authenticated;
