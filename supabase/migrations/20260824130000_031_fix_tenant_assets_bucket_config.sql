/*
# Correctif: la config du bucket tenant-assets ne correspondait pas à ce
# que le code client promettait pour les documents OCR

Le bucket `tenant-assets` (migration 005) n'autorisait que
png/jpeg/svg/webp jusqu'à 2 Mo — pensé uniquement pour les logos/cachets
à l'époque. Mais `uploadOcrDocument()` (src/lib/upload.ts) promet depuis
PNG/JPEG/WebP **et PDF** jusqu'à **5 Mo**, avec un message d'erreur qui
mentionne explicitement le PDF.

Résultat concret: tout envoi d'un PDF pour l'OCR (le format le plus
courant pour un reçu scanné) était rejeté par Supabase Storage lui-même
-- une fonctionnalité payante (OCR, Premium+) silencieusement cassée,
indépendamment de ce que dit le code applicatif.

Cette migration aligne la config du bucket sur l'union des besoins
réels: logos/cachets (2 Mo, images) ET documents OCR (5 Mo, images + PDF).
*/

UPDATE storage.buckets
SET
  file_size_limit = 5242880, -- 5 MB, couvre le plus grand des deux usages
  allowed_mime_types = ARRAY['image/png', 'image/jpeg', 'image/svg+xml', 'image/webp', 'application/pdf']
WHERE id = 'tenant-assets';
