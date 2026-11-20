import { Camera, Download, Eye, FileText, FileUp, Paperclip, Trash2 } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useAuth } from '../auth/AuthProvider';
import { logEvent } from '../lib/audit';
import { ACCEPTED_DOC_TYPES, compressImage, MAX_UPLOAD_BYTES, signedUrl, uploadPrivate } from '../lib/files';
import { daysUntil, fmtBytes, fmtDate, fmtDateTime, REVIEW_LABEL } from '../lib/format';
import { BUCKET, friendlyError, supabase } from '../lib/supabase';
import type { DocOwner, DocumentRow, DocumentType, ReviewStatus } from '../lib/types';
import { Button, cx, EmptyState, ErrorBox, Field, Input, Modal, ReviewBadge, Select, Spinner, Textarea, useConfirm, useToast } from './ui';

let typesCache: DocumentType[] | null = null;
export async function loadDocTypes(force = false): Promise<DocumentType[]> {
  if (typesCache && !force) return typesCache;
  const { data, error } = await supabase.from('document_types').select('*').order('sort_order');
  if (error) throw error;
  typesCache = (data ?? []) as DocumentType[];
  return typesCache;
}

/* --------------------------- Carga de documento --------------------------- */
export function DocumentUploadForm({
  ownerType,
  ownerId,
  onDone,
}: {
  ownerType: DocOwner;
  ownerId: string;
  onDone: () => void;
}) {
  const toast = useToast();
  const [types, setTypes] = useState<DocumentType[]>([]);
  const [docType, setDocType] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [issue, setIssue] = useState('');
  const [expiry, setExpiry] = useState('');
  const [notes, setNotes] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const camRef = useRef<HTMLInputElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    loadDocTypes()
      .then((t) => setTypes(t.filter((x) => x.applies_to === ownerType && x.active)))
      .catch((e) => setError(friendlyError(e)));
  }, [ownerType]);

  const selected = types.find((t) => t.key === docType);

  async function pick(f?: File) {
    setError(null);
    if (!f) return;
    if (!ACCEPTED_DOC_TYPES.includes(f.type)) return setError('Formato no permitido. Use PDF, JPG, PNG o WEBP.');
    const ready = f.type.startsWith('image/') ? await compressImage(f, 2000, 0.82) : f;
    if (ready.size > MAX_UPLOAD_BYTES) return setError('El archivo supera el máximo de 10 MB.');
    setFile(ready);
  }

  async function save() {
    setError(null);
    if (!docType) return setError('Seleccione el tipo de documento.');
    if (!file) return setError('Adjunte el archivo (foto o PDF).');
    if (issue && expiry && expiry < issue) return setError('La fecha de vencimiento no puede ser anterior a la de emisión.');
    setBusy(true);
    let path: string | null = null;
    try {
      path = await uploadPrivate(`${ownerType === 'driver' ? 'drivers' : 'motorcycles'}/${ownerId}/docs`, file);
      const { error } = await supabase.from('documents').insert({
        owner_type: ownerType,
        driver_id: ownerType === 'driver' ? ownerId : null,
        motorcycle_id: ownerType === 'motorcycle' ? ownerId : null,
        doc_type: docType,
        file_path: path,
        file_name: file.name,
        mime_type: file.type,
        size_bytes: file.size,
        issue_date: issue || null,
        expiry_date: expiry || null,
        notes: notes.trim() || null,
      });
      if (error) throw error;
      toast('success', 'Documento cargado correctamente.');
      setFile(null);
      setDocType('');
      setIssue('');
      setExpiry('');
      setNotes('');
      onDone();
    } catch (e) {
      // Si el registro falló, se intenta no dejar el archivo huérfano (sólo admin puede borrarlo)
      if (path) await supabase.storage.from(BUCKET).remove([path]).catch(() => undefined);
      setError(friendlyError(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-4">
      {error && <ErrorBox message={error} />}
      <Field label="Tipo de documento" required>
        <Select value={docType} onChange={(e) => setDocType(e.target.value)}>
          <option value="">Seleccione…</option>
          {types.map((t) => (
            <option key={t.key} value={t.key}>
              {t.label}
            </option>
          ))}
        </Select>
      </Field>
      <div>
        <p className="mb-1.5 text-sm font-medium text-gray-200">
          Archivo <span className="text-yummy-300">*</span>
        </p>
        <div className="flex flex-wrap gap-2">
          <Button type="button" variant="secondary" icon={Camera} onClick={() => camRef.current?.click()}>
            Tomar foto
          </Button>
          <Button type="button" variant="secondary" icon={Paperclip} onClick={() => fileRef.current?.click()}>
            Adjuntar PDF o imagen
          </Button>
        </div>
        <input ref={camRef} type="file" accept="image/*" capture="environment" hidden onChange={(e) => pick(e.target.files?.[0])} />
        <input ref={fileRef} type="file" accept="application/pdf,image/jpeg,image/png,image/webp" hidden onChange={(e) => pick(e.target.files?.[0])} />
        {file && (
          <p className="mt-2 flex items-center gap-2 text-sm text-gray-300">
            <FileText className="h-4 w-4 text-yummy-300" /> {file.name} · {fmtBytes(file.size)}
          </p>
        )}
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Fecha de emisión" hint="Si aplica">
          <Input type="date" value={issue} onChange={(e) => setIssue(e.target.value)} />
        </Field>
        <Field label="Fecha de vencimiento" hint={selected?.has_expiry ? 'Este tipo suele vencer' : 'Sólo si el documento vence'}>
          <Input type="date" value={expiry} onChange={(e) => setExpiry(e.target.value)} />
        </Field>
      </div>
      <Field label="Observaciones">
        <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} />
      </Field>
      <div className="flex justify-end">
        <Button icon={FileUp} loading={busy} onClick={save}>
          Cargar documento
        </Button>
      </div>
    </div>
  );
}

/* --------------------------- Lista de documentos --------------------------- */
export function DocumentList({
  ownerType,
  ownerId,
  driverIdForAudit,
  refreshKey = 0,
  onChanged,
}: {
  ownerType: DocOwner;
  ownerId: string;
  driverIdForAudit?: string | null;
  refreshKey?: number;
  onChanged?: () => void;
}) {
  const { isAdmin } = useAuth();
  const toast = useToast();
  const confirm = useConfirm();
  const [docs, setDocs] = useState<DocumentRow[] | null>(null);
  const [types, setTypes] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [review, setReview] = useState<DocumentRow | null>(null);

  const load = useCallback(async () => {
    setError(null);
    const col = ownerType === 'driver' ? 'driver_id' : 'motorcycle_id';
    const [{ data, error }, t] = await Promise.all([
      supabase.from('documents').select('*').eq(col, ownerId).order('uploaded_at', { ascending: false }),
      loadDocTypes().catch(() => []),
    ]);
    if (error) return setError(friendlyError(error));
    setTypes(Object.fromEntries(t.map((x) => [x.key, x.label])));
    setDocs((data ?? []) as DocumentRow[]);
  }, [ownerType, ownerId]);

  useEffect(() => {
    void load();
  }, [load, refreshKey]);

  async function open(d: DocumentRow, download: boolean) {
    try {
      const url = await signedUrl(d.file_path, download ? d.file_name : undefined);
      void logEvent(download ? 'DOWNLOAD' : 'VIEW_DOCUMENT', `${types[d.doc_type] ?? d.doc_type}: ${d.file_name}`, driverIdForAudit);
      window.open(url, '_blank', 'noopener');
    } catch (e) {
      toast('error', friendlyError(e));
    }
  }

  async function remove(d: DocumentRow) {
    const ok = await confirm({
      title: 'Eliminar documento',
      message: 'El archivo se eliminará definitivamente. La acción quedará registrada en auditoría.',
      confirmText: 'Eliminar',
      danger: true,
    });
    if (!ok) return;
    const { error } = await supabase.from('documents').delete().eq('id', d.id);
    if (error) return toast('error', friendlyError(error));
    await supabase.storage.from(BUCKET).remove([d.file_path]);
    toast('success', 'Documento eliminado.');
    void load();
    onChanged?.();
  }

  if (error) return <ErrorBox message={error} onRetry={load} />;
  if (!docs) return <Spinner />;
  if (docs.length === 0) return <EmptyState icon={FileText} title="Sin documentos" text="Aún no se ha cargado ningún documento." />;

  return (
    <>
      <ul className="space-y-2">
        {docs.map((d) => {
          const left = d.expiry_date ? daysUntil(d.expiry_date) : null;
          return (
            <li key={d.id} className="rounded-xl border border-ink-600 bg-ink-900/50 p-3">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="font-medium text-white">{types[d.doc_type] ?? d.doc_type}</p>
                  <p className="truncate text-xs text-gray-400">
                    {d.file_name} · {fmtBytes(d.size_bytes)} · cargado {fmtDateTime(d.uploaded_at)}
                  </p>
                  <p className="mt-1 text-xs text-gray-400">
                    Emisión: {fmtDate(d.issue_date)} · Vencimiento:{' '}
                    {d.expiry_date ? (
                      <span
                        className={cx(
                          left! < 0 ? 'text-red-300' : left! <= 7 ? 'text-orange-300' : left! <= 30 ? 'text-amber-200' : 'text-gray-300',
                        )}
                      >
                        {fmtDate(d.expiry_date)} {left! < 0 ? '(vencido)' : left! <= 30 ? `(${left} días)` : ''}
                      </span>
                    ) : (
                      'No aplica'
                    )}
                  </p>
                  {d.notes && <p className="mt-1 text-xs text-gray-300">Obs.: {d.notes}</p>}
                </div>
                <ReviewBadge status={d.review_status} />
              </div>
              <div className="mt-2 flex flex-wrap gap-2">
                <Button size="sm" variant="secondary" icon={Eye} onClick={() => open(d, false)}>
                  Ver
                </Button>
                <Button size="sm" variant="secondary" icon={Download} onClick={() => open(d, true)}>
                  Descargar
                </Button>
                <Button size="sm" variant="ghost" onClick={() => setReview(d)}>
                  Revisar
                </Button>
                {isAdmin && (
                  <Button size="sm" variant="ghost" icon={Trash2} onClick={() => remove(d)} className="text-red-300">
                    Eliminar
                  </Button>
                )}
              </div>
            </li>
          );
        })}
      </ul>
      <ReviewModal
        doc={review}
        onClose={() => setReview(null)}
        onSaved={() => {
          setReview(null);
          void load();
          onChanged?.();
        }}
      />
    </>
  );
}

function ReviewModal({ doc, onClose, onSaved }: { doc: DocumentRow | null; onClose: () => void; onSaved: () => void }) {
  const toast = useToast();
  const [status, setStatus] = useState<ReviewStatus>('pendiente');
  const [notes, setNotes] = useState('');
  const [expiry, setExpiry] = useState('');
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (doc) {
      setStatus(doc.review_status);
      setNotes(doc.notes ?? '');
      setExpiry(doc.expiry_date ?? '');
    }
  }, [doc]);
  async function save() {
    if (!doc) return;
    if (status === 'observado' && !notes.trim()) return toast('error', 'Indique la observación del documento.');
    setBusy(true);
    const { error } = await supabase
      .from('documents')
      .update({ review_status: status, notes: notes.trim() || null, expiry_date: expiry || null })
      .eq('id', doc.id);
    setBusy(false);
    if (error) return toast('error', friendlyError(error));
    toast('success', `Documento marcado como ${REVIEW_LABEL[status].toLowerCase()}.`);
    onSaved();
  }
  return (
    <Modal open={!!doc} onClose={onClose} title="Revisión del documento">
      <div className="space-y-4">
        <div className="grid grid-cols-3 gap-2">
          {(['aprobado', 'pendiente', 'observado'] as ReviewStatus[]).map((s) => (
            <button
              key={s}
              onClick={() => setStatus(s)}
              className={cx(
                'rounded-xl px-3 py-2 text-sm ring-1',
                status === s ? 'bg-yummy-500 text-white ring-yummy-400' : 'bg-ink-900 text-gray-300 ring-ink-500',
              )}
            >
              {REVIEW_LABEL[s]}
            </button>
          ))}
        </div>
        <Field label="Fecha de vencimiento" hint="Déjela vacía si el documento no vence">
          <Input type="date" value={expiry} onChange={(e) => setExpiry(e.target.value)} />
        </Field>
        <Field label="Observaciones" required={status === 'observado'}>
          <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} />
        </Field>
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose}>
            Cancelar
          </Button>
          <Button loading={busy} onClick={save}>
            Guardar revisión
          </Button>
        </div>
      </div>
    </Modal>
  );
}
