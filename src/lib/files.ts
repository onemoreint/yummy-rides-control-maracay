import { BUCKET, supabase } from './supabase';

export const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;
export const ACCEPTED_DOC_TYPES = ['application/pdf', 'image/jpeg', 'image/png', 'image/webp'];

/**
 * Comprime una fotografía en el navegador antes de subirla
 * (lado mayor ≤ maxSide, WebP/JPEG con calidad 0.8). Los PDF no se tocan.
 */
export async function compressImage(file: File, maxSide = 1600, quality = 0.8): Promise<File> {
  if (!file.type.startsWith('image/')) return file;
  const bitmap = await createImageBitmap(file).catch(() => null);
  if (!bitmap) return file;
  const scale = Math.min(1, maxSide / Math.max(bitmap.width, bitmap.height));
  const w = Math.round(bitmap.width * scale);
  const h = Math.round(bitmap.height * scale);
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  if (!ctx) return file;
  ctx.drawImage(bitmap, 0, 0, w, h);
  bitmap.close?.();
  const supportsWebp = canvas.toDataURL('image/webp').startsWith('data:image/webp');
  const type = supportsWebp ? 'image/webp' : 'image/jpeg';
  const blob: Blob | null = await new Promise((res) => canvas.toBlob(res, type, quality));
  if (!blob || blob.size >= file.size) return file;
  const ext = type === 'image/webp' ? 'webp' : 'jpg';
  const base = file.name.replace(/\.[^.]+$/, '') || 'foto';
  return new File([blob], `${base}.${ext}`, { type });
}

function safeName(name: string) {
  return (
    name
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .replace(/[^a-zA-Z0-9._-]/g, '_')
      .slice(-60) || 'archivo'
  );
}

/** Sube un archivo al bucket privado y devuelve su ruta interna. */
export async function uploadPrivate(folder: string, file: File): Promise<string> {
  if (!ACCEPTED_DOC_TYPES.includes(file.type)) throw new Error('Formato no permitido. Use PDF, JPG, PNG o WEBP.');
  if (file.size > MAX_UPLOAD_BYTES) throw new Error('El archivo supera el máximo de 10 MB.');
  const path = `${folder}/${Date.now()}-${crypto.randomUUID().slice(0, 8)}-${safeName(file.name)}`;
  const { error } = await supabase.storage.from(BUCKET).upload(path, file, {
    contentType: file.type,
    upsert: false,
    cacheControl: '3600',
  });
  if (error) throw error;
  return path;
}

const urlCache = new Map<string, { url: string; exp: number }>();

/** URL firmada de corta duración (5 min). Los archivos nunca son públicos. */
export async function signedUrl(path: string, download?: string): Promise<string> {
  const cacheKey = path + (download ?? '');
  const hit = urlCache.get(cacheKey);
  if (hit && hit.exp > Date.now()) return hit.url;
  const { data, error } = await supabase.storage
    .from(BUCKET)
    .createSignedUrl(path, 300, download ? { download } : undefined);
  if (error || !data) throw error ?? new Error('No se pudo abrir el archivo');
  urlCache.set(cacheKey, { url: data.signedUrl, exp: Date.now() + 240_000 });
  return data.signedUrl;
}

/** Descarga un archivo privado como data URL (para incrustarlo en el PDF). */
export async function privateImageDataUrl(path: string): Promise<string | null> {
  const { data, error } = await supabase.storage.from(BUCKET).download(path);
  if (error || !data) return null;
  return blobToJpegDataUrl(data);
}

/** jsPDF no lee WebP en todos los navegadores: se normaliza a JPEG. */
export async function blobToJpegDataUrl(blob: Blob, maxSide = 600): Promise<string | null> {
  const bmp = await createImageBitmap(blob).catch(() => null);
  if (!bmp) return null;
  const scale = Math.min(1, maxSide / Math.max(bmp.width, bmp.height));
  const c = document.createElement('canvas');
  c.width = Math.round(bmp.width * scale);
  c.height = Math.round(bmp.height * scale);
  const ctx = c.getContext('2d');
  if (!ctx) return null;
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, c.width, c.height);
  ctx.drawImage(bmp, 0, 0, c.width, c.height);
  return c.toDataURL('image/jpeg', 0.85);
}

export async function publicAssetDataUrl(relPath: string): Promise<string | null> {
  try {
    const res = await fetch(`${import.meta.env.BASE_URL}${relPath}`);
    if (!res.ok) return null;
    return await blobToJpegDataUrl(await res.blob(), 300);
  } catch {
    return null;
  }
}
