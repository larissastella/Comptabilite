/*
# Create tenant-assets storage bucket

## Overview
Public-readable bucket for tenant branding assets (logo, cachet/stamp).
Objects are scoped per tenant via path: `<tenant_id>/<filename>`.

## Bucket
- Name: `tenant-assets`
- Public: true (logos must be visible on invoices/PDFs without auth)
- Allowed MIME types: PNG, JPEG, SVG, WebP
- Max file size: 2 MB

## RLS Policies on storage.objects
- SELECT (read): public — anyone can view a tenant's logo (needed for invoices/PDFs).
- INSERT (upload): authenticated user can upload to a path starting with their
  tenant_id (verified via tenant_users membership).
- UPDATE: same tenant ownership check.
- DELETE: same tenant ownership check.

## Path convention
`tenant-assets/<tenant_id>/logo.<ext>` and `tenant-assets/<tenant_id>/cachet.<ext>`
*/

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'tenant-assets',
  'tenant-assets',
  true,
  2097152, -- 2 MB
  ARRAY['image/png', 'image/jpeg', 'image/svg+xml', 'image/webp']
)
ON CONFLICT (id) DO UPDATE SET
  public = EXCLUDED.public,
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

-- -------------------------------------------------------
-- Helper: get the tenant_id for the current user
-- (returns text for use in storage policy expressions)
-- -------------------------------------------------------
CREATE OR REPLACE FUNCTION public.current_user_tenant_id()
RETURNS text
LANGUAGE sql SECURITY DEFINER STABLE
SET search_path = public
AS $$
  SELECT tenant_id::text FROM tenant_users WHERE user_id = auth.uid() LIMIT 1;
$$;

-- -------------------------------------------------------
-- Storage policies: tenant-assets bucket
-- -------------------------------------------------------
-- Public read (logos appear on invoices/PDFs shared with clients)
DROP POLICY IF EXISTS "tenant_assets_public_read" ON storage.objects;
CREATE POLICY "tenant_assets_public_read" ON storage.objects FOR SELECT
TO anon, authenticated
USING (bucket_id = 'tenant-assets');

-- Upload: path must start with the caller's tenant_id
DROP POLICY IF EXISTS "tenant_assets_upload" ON storage.objects;
CREATE POLICY "tenant_assets_upload" ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'tenant-assets'
  AND (storage.foldername(name))[1] = public.current_user_tenant_id()
);

-- Update: same ownership
DROP POLICY IF EXISTS "tenant_assets_update" ON storage.objects;
CREATE POLICY "tenant_assets_update" ON storage.objects FOR UPDATE
TO authenticated
USING (
  bucket_id = 'tenant-assets'
  AND (storage.foldername(name))[1] = public.current_user_tenant_id()
)
WITH CHECK (
  bucket_id = 'tenant-assets'
  AND (storage.foldername(name))[1] = public.current_user_tenant_id()
);

-- Delete: same ownership
DROP POLICY IF EXISTS "tenant_assets_delete" ON storage.objects;
CREATE POLICY "tenant_assets_delete" ON storage.objects FOR DELETE
TO authenticated
USING (
  bucket_id = 'tenant-assets'
  AND (storage.foldername(name))[1] = public.current_user_tenant_id()
);
