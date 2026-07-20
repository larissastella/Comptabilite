import { supabase } from './supabase';

const BUCKET = 'tenant-assets';
const MAX_SIZE = 2 * 1024 * 1024; // 2 MB
const DOC_MAX_SIZE = 5 * 1024 * 1024; // 5 MB
const ALLOWED = ['image/png', 'image/jpeg', 'image/svg+xml', 'image/webp'];
const DOC_ALLOWED = ['image/png', 'image/jpeg', 'image/webp', 'application/pdf'];

export interface UploadResult {
  url: string;
  path: string;
}

/**
 * Upload a branding asset (logo or cachet) to the tenant-assets bucket.
 * The file is stored at `<tenant_id>/<kind>.<ext>` so RLS can scope it per tenant.
 */
export async function uploadTenantAsset(
  tenantId: string,
  kind: 'logo' | 'cachet',
  file: File
): Promise<UploadResult> {
  if (!ALLOWED.includes(file.type)) {
    throw new Error('Format non supporté. Utilisez PNG, JPG, SVG ou WebP.');
  }
  if (file.size > MAX_SIZE) {
    throw new Error('Fichier trop volumineux (max 2 MB).');
  }

  const ext = file.name.split('.').pop()?.toLowerCase() || 'png';
  const path = `${tenantId}/${kind}.${ext}`;

  // Remove any existing file at this path (upsert)
  const { error: upErr } = await supabase.storage
    .from(BUCKET)
    .upload(path, file, { upsert: true, contentType: file.type });

  if (upErr) throw upErr;

  const { data } = supabase.storage.from(BUCKET).getPublicUrl(path);
  // Cache-bust so the preview refreshes after re-upload
  const url = `${data.publicUrl}?t=${Date.now()}`;

  return { url, path };
}

/**
 * Upload an OCR document (invoice/receipt photo or PDF) to tenant-assets.
 * Stored at `<tenant_id>/ocr/<timestamp>-<filename>` to keep each upload distinct.
 */
export async function uploadOcrDocument(
  tenantId: string,
  file: File
): Promise<UploadResult> {
  if (!DOC_ALLOWED.includes(file.type)) {
    throw new Error('Format non supporté. Utilisez PNG, JPG, WebP ou PDF.');
  }
  if (file.size > DOC_MAX_SIZE) {
    throw new Error('Fichier trop volumineux (max 5 MB).');
  }

  const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_');
  const path = `${tenantId}/ocr/${Date.now()}-${safeName}`;

  const { error: upErr } = await supabase.storage
    .from(BUCKET)
    .upload(path, file, { contentType: file.type });

  if (upErr) throw upErr;

  const { data } = supabase.storage.from(BUCKET).getPublicUrl(path);
  const url = `${data.publicUrl}?t=${Date.now()}`;

  return { url, path };
}

export function validateImageFile(file: File): string | null {
  if (!ALLOWED.includes(file.type)) {
    return 'Format non supporté. Utilisez PNG, JPG, SVG ou WebP.';
  }
  if (file.size > MAX_SIZE) {
    return 'Fichier trop volumineux (max 2 MB).';
  }
  return null;
}

export function validateDocumentFile(file: File): string | null {
  if (!DOC_ALLOWED.includes(file.type)) {
    return 'Format non supporté. Utilisez PNG, JPG, WebP ou PDF.';
  }
  if (file.size > DOC_MAX_SIZE) {
    return 'Fichier trop volumineux (max 5 MB).';
  }
  return null;
}
