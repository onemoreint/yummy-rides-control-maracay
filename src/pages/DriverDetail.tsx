import {
  ArrowLeft,
  Bike,
  FileDown,
  FilePlus2,
  MessageCircle,
  Pencil,
  Phone,
  Printer,
  RefreshCcw,
  Unlink,
} from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { useAuth } from '../auth/AuthProvider';
import { DocumentList, DocumentUploadForm, loadDocTypes } from '../components/DocumentsPanel';
import MotoAssigner from '../components/MotoAssigner';
import { SignedImage } from '../components/media';
import {
  Badge,
  Button,
  Card,
  cx,
  ErrorBox,
  Field,
  InfoRow,
  Input,
  Modal,
  Select,
  Spinner,
  StatusBadge,
  Tabs,
  Textarea,
  useConfirm,
  useToast,
} from '../components/ui';
import { logEvent } from '../lib/audit';
import { buildFicha } from '../lib/ficha';
import { cedula, fmtDate, fmtDateTime, fmtPhone, fullName, STATUS_LABEL, todayISO, whatsappLink } from '../lib/format';
import { friendlyError, supabase } from '../lib/supabase';
import type { AffiliationHistory, AffiliationStatus, Assignment, AuditLog, Driver, Motorcycle } from '../lib/types';

type Tab = 'resumen' | 'motos' | 'documentos' | 'afiliacion' | 'historial';
type AssignmentWithMoto = Assignment & { motorcycle: Motorcycle };

export default function DriverDetail() {
  const { id } = useParams<{ id: string }>();
  const nav = useNavigate();
  const toast = useToast();
  const confirm = useConfirm();
  const { isAdmin } = useAuth();
  const [params, setParams] = useSearchParams();
  const tab = (params.get('tab') as Tab) || 'resumen';
  const [driver, setDriver] = useState<Driver | null>(null);
  const [assignments, setAssignments] = useState<AssignmentWithMoto[]>([]);
  const [affiliation, setAffiliation] = useState<AffiliationHistory[]>([]);
  const [audit, setAudit] = useState<AuditLog[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [modal, setModal] = useState<'moto' | 'doc' | 'status' | null>(null);
  const [docsKey, setDocsKey] = useState(0);
  const [canChangeStatus, setCanChangeStatus] = useState(false);
  const [pdfBusy, setPdfBusy] = useState<'print' | 'download' | null>(null);

  const load = useCallback(async () => {
    if (!id) return;
    setError(null);
    const [d, a, h, l, s] = await Promise.all([
      supabase.from('drivers').select('*').eq('id', id).maybeSingle(),
      supabase.from('driver_motorcycle_assignments').select('*, motorcycle:motorcycles(*)').eq('driver_id', id).order('start_date', { ascending: false }).order('created_at', { ascending: false }),
      supabase.from('affiliation_history').select('*').eq('driver_id', id).order('created_at', { ascending: false }),
      supabase.from('audit_logs').select('*').eq('driver_id', id).order('created_at', { ascending: false }).limit(100),
      supabase.from('system_settings').select('value').eq('key', 'operator_can_change_status').maybeSingle(),
    ]);
    const err = d.error || a.error || h.error || l.error;
    if (err) return setError(friendlyError(err));
    if (!d.data) return setError('Conductor no encontrado o sin permisos para verlo.');
    setDriver(d.data as Driver);
    setAssignments((a.data ?? []) as AssignmentWithMoto[]);
    setAffiliation((h.data ?? []) as AffiliationHistory[]);
    setAudit((l.data ?? []) as AuditLog[]);
    setCanChangeStatus(isAdmin || s.data?.value === true);
  }, [id, isAdmin]);

  useEffect(() => {
    void load();
  }, [load]);

  async function pdf(mode: 'print' | 'download') {
    if (!driver) return;
    setPdfBusy(mode);
    try {
      const [docs, types] = await Promise.all([
        supabase.from('documents').select('*').eq('driver_id', driver.id).order('uploaded_at'),
        loadDocTypes(),
      ]);
      await buildFicha(
        {
          driver,
          assignments,
          documents: docs.data ?? [],
          docLabels: Object.fromEntries(types.map((t) => [t.key, t.label])),
          affiliation,
        },
        mode,
      );
      void logEvent(mode === 'print' ? 'PRINT' : 'EXPORT', `Ficha PDF de ${driver.code}`, driver.id);
    } catch (e) {
      toast('error', friendlyError(e));
    } finally {
      setPdfBusy(null);
    }
  }

  async function endAssignment(a: AssignmentWithMoto) {
    const ok = await confirm({
      title: 'Liberar motocicleta',
      message: `La moto ${a.motorcycle.plate} dejará de estar asignada a este conductor. El historial se conserva.`,
      confirmText: 'Liberar',
    });
    if (!ok) return;
    const { error } = await supabase.rpc('end_assignment', { p_assignment_id: a.id, p_reason: 'Liberada manualmente', p_end_date: todayISO() });
    if (error) return toast('error', friendlyError(error));
    toast('success', 'Motocicleta liberada.');
    void load();
  }

  if (error) return <ErrorBox message={error} onRetry={load} />;
  if (!driver) return <Spinner />;
  const current = assignments.find((a) => a.is_current);
  const wa = whatsappLink(driver.whatsapp || driver.phone);

  return (
    <>
      <button onClick={() => nav(-1)} className="no-print mb-4 inline-flex items-center gap-1 text-sm text-gray-400 hover:text-white">
        <ArrowLeft className="h-4 w-4" /> Volver
      </button>

      {/* Cabecera del expediente */}
      <Card className="mb-4 bg-gradient-to-br from-yummy-950 via-ink-800 to-ink-800">
        <div className="flex flex-col gap-5 md:flex-row md:items-center">
          <SignedImage path={driver.photo_path} alt={fullName(driver)} className="h-28 w-28 shrink-0 rounded-2xl ring-2 ring-yummy-500/60" />
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-xl font-bold text-white sm:text-2xl">{fullName(driver)}</h1>
              <StatusBadge status={driver.status} draft={driver.is_draft} />
            </div>
            <p className="mt-1 text-sm text-gray-300">
              {driver.code} · {cedula(driver)} · Ingreso {fmtDate(driver.join_date)}
            </p>
            <div className="mt-2 flex flex-wrap gap-3 text-sm">
              {driver.phone && (
                <a href={`tel:${driver.phone}`} className="inline-flex items-center gap-1 text-yummy-200 hover:underline">
                  <Phone className="h-4 w-4" /> {fmtPhone(driver.phone)}
                </a>
              )}
              {wa && (
                <a href={wa} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-emerald-300 hover:underline">
                  <MessageCircle className="h-4 w-4" /> WhatsApp
                </a>
              )}
              <span className="inline-flex items-center gap-1 text-gray-300">
                <Bike className="h-4 w-4" /> {current ? `${current.motorcycle.plate} · ${current.motorcycle.brand} ${current.motorcycle.model}` : 'Sin moto asignada'}
              </span>
            </div>
          </div>
        </div>
        <div className="no-print mt-5 flex flex-wrap gap-2">
          <Button icon={Pencil} variant="secondary" onClick={() => nav(`/conductores/${driver.id}/editar`)}>
            {driver.is_draft ? 'Continuar registro' : 'Editar expediente'}
          </Button>
          <Button icon={Bike} variant="secondary" onClick={() => setModal('moto')} disabled={driver.status === 'retirado'}>
            Registrar motocicleta
          </Button>
          <Button icon={FilePlus2} variant="secondary" onClick={() => setModal('doc')}>
            Agregar documento
          </Button>
          {canChangeStatus && !driver.is_draft && (
            <Button icon={RefreshCcw} variant="secondary" onClick={() => setModal('status')}>
              Cambiar estado
            </Button>
          )}
          <Button icon={Printer} variant="secondary" loading={pdfBusy === 'print'} onClick={() => pdf('print')}>
            Imprimir ficha
          </Button>
          <Button icon={FileDown} loading={pdfBusy === 'download'} onClick={() => pdf('download')}>
            Exportar PDF
          </Button>
        </div>
      </Card>

      <Tabs<Tab>
        value={tab}
        onChange={(t) => setParams({ tab: t }, { replace: true })}
        tabs={[
          { id: 'resumen', label: 'Resumen' },
          { id: 'motos', label: 'Motocicletas', count: assignments.length },
          { id: 'documentos', label: 'Documentos' },
          { id: 'afiliacion', label: 'Afiliación', count: affiliation.length },
          { id: 'historial', label: 'Modificaciones', count: audit.length },
        ]}
      />

      {tab === 'resumen' && (
        <div className="grid gap-4 lg:grid-cols-2">
          <Card>
            <h2 className="mb-2 font-semibold text-white">Datos personales</h2>
            <dl className="divide-y divide-ink-600">
              <InfoRow label="Nombre completo">{fullName(driver)}</InfoRow>
              <InfoRow label="Cédula">{cedula(driver)}</InfoRow>
              <InfoRow label="Nacimiento">{fmtDate(driver.birth_date)}</InfoRow>
              <InfoRow label="Teléfono">{fmtPhone(driver.phone)}</InfoRow>
              <InfoRow label="WhatsApp">{fmtPhone(driver.whatsapp)}</InfoRow>
              <InfoRow label="Dirección">{driver.address}</InfoRow>
              <InfoRow label="Parroquia">{driver.parish}</InfoRow>
              <InfoRow label="Municipio">{driver.municipality}</InfoRow>
              <InfoRow label="Estado">{driver.state}</InfoRow>
            </dl>
          </Card>
          <div className="space-y-4">
            <Card>
              <h2 className="mb-2 font-semibold text-white">Contacto de emergencia</h2>
              <dl className="divide-y divide-ink-600">
                <InfoRow label="Nombre">{driver.emergency_name}</InfoRow>
                <InfoRow label="Parentesco">{driver.emergency_relationship}</InfoRow>
                <InfoRow label="Teléfono">{fmtPhone(driver.emergency_phone)}</InfoRow>
              </dl>
            </Card>
            <Card>
              <h2 className="mb-2 font-semibold text-white">Información administrativa</h2>
              <dl className="divide-y divide-ink-600">
                <InfoRow label="Fecha de ingreso">{fmtDate(driver.join_date)}</InfoRow>
                <InfoRow label="Estado de afiliación">{STATUS_LABEL[driver.status]}</InfoRow>
                <InfoRow label="Observaciones">{driver.internal_notes}</InfoRow>
                <InfoRow label="Registrado">{fmtDateTime(driver.created_at)}</InfoRow>
                <InfoRow label="Última actualización">{fmtDateTime(driver.updated_at)}</InfoRow>
              </dl>
            </Card>
          </div>
        </div>
      )}

      {tab === 'motos' && (
        <Card>
          {assignments.length === 0 ? (
            <p className="py-6 text-center text-sm text-gray-500">Este conductor no tiene motocicletas registradas.</p>
          ) : (
            <ul className="space-y-3">
              {assignments.map((a) => (
                <li key={a.id} className={cx('flex flex-col gap-3 rounded-xl p-3 ring-1 sm:flex-row sm:items-center', a.is_current ? 'bg-yummy-500/10 ring-yummy-500/40' : 'bg-ink-900/50 ring-ink-600')}>
                  <SignedImage path={a.motorcycle.photo_front_path} alt={a.motorcycle.plate} fallback="image" className="h-16 w-24 shrink-0 rounded-lg" />
                  <div className="flex-1 text-sm">
                    <Link to={`/motocicletas/${a.motorcycle.id}`} className="font-medium text-white hover:text-yummy-200">
                      {a.motorcycle.plate} · {a.motorcycle.brand} {a.motorcycle.model}
                    </Link>{' '}
                    {a.is_current && <Badge className="bg-emerald-500/15 text-emerald-300 ring-emerald-500/30">Actual</Badge>}
                    <p className="text-xs text-gray-400">
                      {a.motorcycle.code} · Propietario: {a.motorcycle.owner_name}
                    </p>
                    <p className="text-xs text-gray-400">
                      Desde {fmtDate(a.start_date)} {a.end_date ? `hasta ${fmtDate(a.end_date)}` : ''} {a.end_reason ? `· ${a.end_reason}` : ''}
                    </p>
                  </div>
                  {a.is_current && (
                    <Button size="sm" variant="ghost" icon={Unlink} onClick={() => endAssignment(a)}>
                      Liberar
                    </Button>
                  )}
                </li>
              ))}
            </ul>
          )}
        </Card>
      )}

      {tab === 'documentos' && (
        <Card>
          <DocumentList ownerType="driver" ownerId={driver.id} driverIdForAudit={driver.id} refreshKey={docsKey} />
          {current && (
            <p className="mt-4 text-sm text-gray-400">
              Documentos de la moto actual:{' '}
              <Link className="text-yummy-300 hover:underline" to={`/motocicletas/${current.motorcycle.id}`}>
                ver ficha de {current.motorcycle.plate}
              </Link>
            </p>
          )}
        </Card>
      )}

      {tab === 'afiliacion' && (
        <Card>
          <ol className="relative space-y-4 border-l border-ink-500 pl-5">
            {affiliation.map((h) => (
              <li key={h.id}>
                <span className="absolute -left-1.5 mt-1.5 h-3 w-3 rounded-full bg-yummy-500 ring-4 ring-ink-800" />
                <p className="text-sm text-white">
                  {h.previous_status ? `${STATUS_LABEL[h.previous_status]} → ` : ''}
                  <strong>{STATUS_LABEL[h.new_status]}</strong>
                </p>
                <p className="text-xs text-gray-400">
                  Efectivo {fmtDate(h.effective_date)} · {h.changed_by_name || 'Sistema'} · {fmtDateTime(h.created_at)}
                </p>
                {h.reason && <p className="mt-1 text-sm text-gray-300">Motivo: {h.reason}</p>}
                {h.notes && <p className="text-sm text-gray-400">Obs.: {h.notes}</p>}
              </li>
            ))}
          </ol>
        </Card>
      )}

      {tab === 'historial' && (
        <Card>
          {audit.length === 0 ? (
            <p className="py-6 text-center text-sm text-gray-500">Sin modificaciones registradas.</p>
          ) : (
            <ul className="divide-y divide-ink-600">
              {audit.map((l) => (
                <li key={l.id} className="py-2.5">
                  <p className="text-sm text-white">{l.summary}</p>
                  <p className="text-xs text-gray-500">
                    {l.actor_email ?? 'sistema'} · {fmtDateTime(l.created_at)}
                  </p>
                  {l.action === 'UPDATE' && l.old_data && l.new_data && <ChangedFields oldData={l.old_data} newData={l.new_data} />}
                </li>
              ))}
            </ul>
          )}
        </Card>
      )}

      <Modal open={modal === 'moto'} onClose={() => setModal(null)} title="Registrar o cambiar motocicleta" wide>
        <MotoAssigner
          driver={driver}
          onAssigned={() => {
            setModal(null);
            void load();
          }}
        />
      </Modal>
      <Modal open={modal === 'doc'} onClose={() => setModal(null)} title="Agregar documento">
        <DocumentUploadForm
          ownerType="driver"
          ownerId={driver.id}
          onDone={() => {
            setModal(null);
            setDocsKey((k) => k + 1);
            setParams({ tab: 'documentos' }, { replace: true });
          }}
        />
      </Modal>
      <StatusModal
        open={modal === 'status'}
        driver={driver}
        onClose={() => setModal(null)}
        onSaved={() => {
          setModal(null);
          void load();
        }}
      />
    </>
  );
}

const FIELD_LABELS: Record<string, string> = {
  first_name: 'Primer nombre',
  middle_name: 'Segundo nombre',
  last_name: 'Primer apellido',
  second_last_name: 'Segundo apellido',
  id_prefix: 'Prefijo cédula',
  id_number: 'Cédula',
  birth_date: 'Nacimiento',
  phone: 'Teléfono',
  whatsapp: 'WhatsApp',
  address: 'Dirección',
  municipality: 'Municipio',
  parish: 'Parroquia',
  state: 'Estado',
  photo_path: 'Fotografía',
  emergency_name: 'Contacto emergencia',
  emergency_relationship: 'Parentesco',
  emergency_phone: 'Teléfono emergencia',
  join_date: 'Fecha de ingreso',
  status: 'Estado afiliación',
  is_draft: 'Borrador',
  internal_notes: 'Observaciones',
  review_status: 'Revisión',
  expiry_date: 'Vencimiento',
  notes: 'Observaciones',
  is_current: 'Vigente',
  end_date: 'Fin',
};
const HIDDEN = new Set(['updated_by', 'created_by', 'draft_step', 'reviewed_by', 'reviewed_at']);

function ChangedFields({ oldData, newData }: { oldData: Record<string, unknown>; newData: Record<string, unknown> }) {
  const keys = Object.keys(newData).filter((k) => !HIDDEN.has(k) && JSON.stringify(oldData[k]) !== JSON.stringify(newData[k]));
  if (!keys.length) return null;
  return (
    <ul className="mt-1 space-y-0.5 text-xs text-gray-400">
      {keys.map((k) => (
        <li key={k}>
          <span className="text-gray-300">{FIELD_LABELS[k] ?? k}:</span>{' '}
          {k === 'photo_path' ? 'actualizada' : `${String(oldData[k] ?? '—')} → ${String(newData[k] ?? '—')}`}
        </li>
      ))}
    </ul>
  );
}

function StatusModal({ open, driver, onClose, onSaved }: { open: boolean; driver: Driver; onClose: () => void; onSaved: () => void }) {
  const toast = useToast();
  const confirm = useConfirm();
  const { profile } = useAuth();
  const [status, setStatus] = useState<AffiliationStatus>('activo');
  const [date, setDate] = useState(todayISO());
  const [reason, setReason] = useState('');
  const [notes, setNotes] = useState('');
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (open) {
      setStatus(driver.status === 'activo' ? 'suspendido' : 'activo');
      setDate(todayISO());
      setReason('');
      setNotes('');
    }
  }, [open, driver.status]);
  const needsReason = status === 'suspendido' || status === 'retirado';

  async function save() {
    if (needsReason && reason.trim().length < 3) return toast('error', 'Indique el motivo.');
    const ok = await confirm({
      title: 'Confirmar cambio de estado',
      message: (
        <>
          {fullName(driver)} pasará de <strong>{STATUS_LABEL[driver.status]}</strong> a <strong>{STATUS_LABEL[status]}</strong>.
          {status === 'retirado' && ' Su motocicleta actual quedará liberada (el historial se conserva).'}
        </>
      ),
      confirmText: 'Cambiar estado',
      danger: needsReason,
    });
    if (!ok) return;
    setBusy(true);
    const { error } = await supabase.rpc('change_driver_status', {
      p_driver_id: driver.id,
      p_new_status: status,
      p_reason: reason.trim() || null,
      p_notes: notes.trim() || null,
      p_effective_date: date,
    });
    setBusy(false);
    if (error) return toast('error', friendlyError(error));
    toast('success', `Estado actualizado a ${STATUS_LABEL[status]}.`);
    onSaved();
  }

  return (
    <Modal open={open} onClose={onClose} title="Cambiar estado de afiliación">
      <div className="space-y-4">
        <p className="text-sm text-gray-400">
          Estado actual: <StatusBadge status={driver.status} />
        </p>
        <Field label="Nuevo estado" required>
          <Select value={status} onChange={(e) => setStatus(e.target.value as AffiliationStatus)}>
            {(['activo', 'pendiente', 'suspendido', 'retirado'] as AffiliationStatus[])
              .filter((s) => s !== driver.status)
              .map((s) => (
                <option key={s} value={s}>
                  {STATUS_LABEL[s]}
                </option>
              ))}
          </Select>
        </Field>
        <Field label="Fecha" required>
          <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        </Field>
        <Field label="Motivo" required={needsReason}>
          <Input value={reason} onChange={(e) => setReason(e.target.value)} placeholder={needsReason ? 'Obligatorio' : 'Opcional'} />
        </Field>
        <Field label="Observaciones">
          <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} />
        </Field>
        <p className="text-xs text-gray-500">Responsable: {profile?.full_name || profile?.email}</p>
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose}>
            Cancelar
          </Button>
          <Button loading={busy} onClick={save}>
            Guardar
          </Button>
        </div>
      </div>
    </Modal>
  );
}
