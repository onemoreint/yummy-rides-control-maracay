import { Camera, ImageOff, Upload, User, X } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { compressImage, signedUrl } from '../lib/files';
import { cx } from './ui';

/** Imagen privada: se pide una URL firmada temporal al mostrarla. */
export function SignedImage({
  path,
  alt,
  className,
  fallback = 'user',
}: {
  path: string | null | undefined;
  alt: string;
  className?: string;
  fallback?: 'user' | 'image';
}) {
  const [url, setUrl] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    let alive = true;
    setUrl(null);
    setFailed(false);
    if (path) {
      signedUrl(path)
        .then((u) => alive && setUrl(u))
        .catch(() => alive && setFailed(true));
    }
    return () => {
      alive = false;
    };
  }, [path]);
  if (!path || failed) {
    const I = fallback === 'user' ? User : ImageOff;
    return (
      <div className={cx('flex items-center justify-center bg-ink-700 text-gray-500', className)} aria-label={alt}>
        <I className="h-1/3 w-1/3" />
      </div>
    );
  }
  if (!url) return <div className={cx('animate-pulse bg-ink-700', className)} />;
  return <img src={url} alt={alt} className={cx('object-cover', className)} loading="lazy" />;
}

/**
 * Selector de foto con cámara del celular (capture) y compresión previa.
 * Devuelve un File ya comprimido.
 */
export function PhotoInput({
  label,
  file,
  existingPath,
  onChange,
  round,
}: {
  label: string;
  file: File | null;
  existingPath?: string | null;
  onChange: (f: File | null) => void;
  round?: boolean;
}) {
  const camRef = useRef<HTMLInputElement>(null);
  const galRef = useRef<HTMLInputElement>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!file) return setPreview(null);
    const u = URL.createObjectURL(file);
    setPreview(u);
    return () => URL.revokeObjectURL(u);
  }, [file]);

  async function handle(f: File | undefined) {
    if (!f) return;
    if (!f.type.startsWith('image/')) return;
    setBusy(true);
    try {
      onChange(await compressImage(f));
    } finally {
      setBusy(false);
    }
  }

  const shape = round ? 'h-28 w-28 rounded-full' : 'h-28 w-full rounded-xl';
  return (
    <div>
      <p className="mb-1.5 text-sm font-medium text-gray-200">{label}</p>
      <div className="flex items-center gap-3">
        <div className={cx('relative shrink-0 overflow-hidden ring-1 ring-ink-500', round ? '' : 'w-36', shape)}>
          {preview ? (
            <img src={preview} alt={label} className="h-full w-full object-cover" />
          ) : (
            <SignedImage path={existingPath} alt={label} className="h-full w-full" fallback={round ? 'user' : 'image'} />
          )}
          {busy && <div className="absolute inset-0 animate-pulse bg-yummy-900/60" />}
          {file && (
            <button
              type="button"
              onClick={() => onChange(null)}
              className="absolute right-1 top-1 rounded-full bg-black/70 p-1 text-white"
              aria-label="Quitar foto"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
        <div className="flex flex-col gap-2">
          <button
            type="button"
            onClick={() => camRef.current?.click()}
            className="inline-flex items-center gap-2 rounded-lg bg-ink-700 px-3 py-2 text-xs text-white ring-1 ring-ink-500 hover:bg-ink-600"
          >
            <Camera className="h-4 w-4" /> Tomar foto
          </button>
          <button
            type="button"
            onClick={() => galRef.current?.click()}
            className="inline-flex items-center gap-2 rounded-lg bg-ink-700 px-3 py-2 text-xs text-white ring-1 ring-ink-500 hover:bg-ink-600"
          >
            <Upload className="h-4 w-4" /> Elegir archivo
          </button>
        </div>
        <input ref={camRef} type="file" accept="image/*" capture="environment" hidden onChange={(e) => handle(e.target.files?.[0])} />
        <input ref={galRef} type="file" accept="image/*" hidden onChange={(e) => handle(e.target.files?.[0])} />
      </div>
    </div>
  );
}
