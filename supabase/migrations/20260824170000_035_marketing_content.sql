/*
# Contenu marketing pilotable — bandeau + popup

L'objectif: le super admin doit pouvoir changer le texte, le lien et
activer/désactiver un bandeau ou une popup marketing depuis l'app, sans
jamais avoir besoin d'un déploiement de code. Tout est donc en base,
avec RLS permettant une lecture PUBLIQUE (le bandeau/popup s'affiche sur
le landing page, avant connexion) mais une écriture réservée au super
admin.

Un seul bandeau et une seule popup "actifs" à la fois par simplicité
(pas de file d'attente/rotation) — le super admin désactive l'ancien et
active le nouveau quand il veut changer de campagne.
*/

CREATE TABLE IF NOT EXISTS marketing_content (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  kind         text NOT NULL CHECK (kind IN ('banner', 'popup')),
  title        text NOT NULL,
  body         text,
  cta_text     text,
  cta_url      text,
  bg_color     text DEFAULT '#0057D9',
  is_active    boolean NOT NULL DEFAULT false,
  starts_at    timestamptz,
  ends_at      timestamptz,
  created_by   uuid REFERENCES auth.users(id),
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now()
);

-- Only one active row per kind at a time — keeps the frontend query
-- trivial (fetch the single active banner / active popup) and avoids
-- ambiguity about which campaign is "the" current one.
CREATE UNIQUE INDEX IF NOT EXISTS idx_marketing_content_one_active_per_kind
  ON marketing_content (kind) WHERE is_active = true;

ALTER TABLE marketing_content ENABLE ROW LEVEL SECURITY;

-- Public read (anon included) of ACTIVE content only, and only within
-- its optional scheduling window — this is what the public landing page
-- queries before the user is even logged in.
DROP POLICY IF EXISTS "marketing_content_public_read" ON marketing_content;
CREATE POLICY "marketing_content_public_read" ON marketing_content FOR SELECT
TO anon, authenticated
USING (
  is_active = true
  AND (starts_at IS NULL OR starts_at <= now())
  AND (ends_at IS NULL OR ends_at >= now())
);

-- Super admin: full read (including inactive, for the management UI) and write.
DROP POLICY IF EXISTS "marketing_content_admin_all" ON marketing_content;
CREATE POLICY "marketing_content_admin_all" ON marketing_content FOR ALL
TO authenticated
USING (is_super_admin())
WITH CHECK (is_super_admin());

-- Seed one real, immediately-active banner promoting the annual plan
-- (matches the 20% annual discount already mentioned elsewhere on the
-- pricing page) — live right away, editable/replaceable anytime from
-- Super Admin -> Marketing without touching code.
INSERT INTO marketing_content (kind, title, body, cta_text, cta_url, bg_color, is_active)
VALUES (
  'banner',
  'Économise 20% avec l''abonnement annuel',
  'Passe en facturation annuelle et paie 2 mois offerts.',
  'Voir les tarifs',
  '/app/billing',
  '#0057D9',
  true
);
