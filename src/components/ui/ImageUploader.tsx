import { useRef, useState } from 'react';
import { Upload, X, Loader2, ImageIcon } from 'lucide-react';
import { uploadTenantAsset, validateImageFile } from '../../lib/upload';
import toast from 'react-hot-toast';

interface ImageUploaderProps {
  tenantId: string;
  kind: 'logo' | 'cachet';
  label: string;
  description?: string;
  currentUrl?: string;
  onUploaded: (url: string) => void;
  aspect?: 'square' | 'round';
}

export default function ImageUploader({
  tenantId, kind, label, description, currentUrl, onUploaded, aspect = 'square',
}: ImageUploaderProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [preview, setPreview] = useState(currentUrl || '');
  const [uploading, setUploading] = useState(false);

  async function handleFile(file: File) {
    const err = validateImageFile(file);
    if (err) {
      toast.error(err);
      return;
    }
    setUploading(true);
    try {
      const { url } = await uploadTenantAsset(tenantId, kind, file);
      setPreview(url);
      onUploaded(url);
      toast.success(`${label} téléversé`);
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : 'Échec du téléversement');
    } finally {
      setUploading(false);
    }
  }

  function onDrop(e: React.DragEvent) {
    e.preventDefault();
    const file = e.dataTransfer.files?.[0];
    if (file) handleFile(file);
  }

  return (
    <div>
      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">{label}</label>
      <div
        onDragOver={e => e.preventDefault()}
        onDrop={onDrop}
        className="relative border-2 border-dashed border-gray-200 dark:border-surface-3 dark:bg-surface-2 rounded-xl p-4 hover:border-[#0057D9] dark:hover:border-[#0057D9] transition-colors cursor-pointer"
        onClick={() => inputRef.current?.click()}
      >
        <input
          ref={inputRef}
          type="file"
          accept="image/png,image/jpeg,image/svg+xml,image/webp"
          className="hidden"
          onChange={e => {
            const f = e.target.files?.[0];
            if (f) handleFile(f);
            e.target.value = '';
          }}
        />
        <div className="flex items-center gap-4">
          <div className={`${aspect === 'round' ? 'rounded-full' : 'rounded-xl'} w-16 h-16 bg-gray-100 dark:bg-surface-3 flex items-center justify-center overflow-hidden flex-shrink-0`}>
            {preview ? (
              <img src={preview} alt={label} className="w-full h-full object-contain" />
            ) : uploading ? (
              <Loader2 className="w-5 h-5 text-gray-400 dark:text-gray-500 animate-spin" />
            ) : (
              <ImageIcon className="w-6 h-6 text-gray-300 dark:text-gray-600" />
            )}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-gray-700 dark:text-gray-300">
              {uploading ? 'Téléversement...' : preview ? 'Remplacer' : 'Choisir un fichier'}
            </p>
            <p className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">
              {description || 'PNG, JPG, SVG — max 2 MB'}
            </p>
          </div>
          {uploading ? (
            <Loader2 className="w-5 h-5 text-[#0057D9] animate-spin flex-shrink-0" />
          ) : (
            <Upload className="w-5 h-5 text-gray-400 flex-shrink-0" />
          )}
        </div>
        {preview && !uploading && (
          <button
            type="button"
            onClick={e => { e.stopPropagation(); setPreview(''); onUploaded(''); }}
            className="absolute top-2 right-2 p-1 bg-white/80 dark:bg-surface-1/80 rounded-full hover:bg-white dark:hover:bg-surface-1 text-gray-500 dark:text-gray-400 hover:text-red-500 dark:hover:text-red-400"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        )}
      </div>
    </div>
  );
}
