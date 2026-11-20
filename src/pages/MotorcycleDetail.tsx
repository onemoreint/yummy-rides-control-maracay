import { ArrowLeft, FilePlus2, Link2, Pencil } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { DocumentList, DocumentUploadForm } from '../components/DocumentsPanel';
import MotorcycleEditor from '../components/MotorcycleEditor';
import { SignedImage } from '../components/media';
import { Badge, Button, Card, ErrorBox, InfoRow, Input, Modal, Spinner, StatusBadge, useToast } from '../components/ui';
import { cedula, fmtDate, searchTerm, shortName, todayISO } from '../lib/format';
import { friendlyError, supabase } from '../lib/supabase';
import type { Assignment, Driver, Motorcycle } from '../lib/types';

type AssignmentWithDriver = Assignment & { driver: Driver };

export default function MotorcycleDetail() {
  const { id } = useParams<{ id: string }>();
  const nav = useNavigate();
  const toast = useToast();
  const [moto, setMoto] = useState<Motorcycle | null>(null);
  const [history, setHistory] = useState<AssignmentWithDriver[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [modal, setModal] = useState<'edit' | 'doc' | 'assign' | null>(null);
  const [docsKey, setDocsKey] = useState(0);

  const load = useCallback(async () => {
    if (!id) return;
    setError(null);
    const [m, h] = await Promise.all([
      supabase.from('motorcycles').select('*').eq('id', id).maybeSingle(),
      supabase
        .from('driver_motorcycle_assignments')
        .select('*, driver:drivers(*)')
        .eq('motorcycle_id', id)
        .order('start_date', { ascending: false })
        .order('created_at', { ascending: false }),
    ]);
    if (m.error || h.error) return setError(friendlyError(m.error || h.error));
    if (!m.data) return setError('Motocicleta no encontrada.');
    setMoto(m.data as Motorcycle);
    setHistory((h.data ?? []) as AssignmentWithDriver[]);
  }, [id]);

  useEffect(() => {
    void load();
  }, [load]);

  if (error) return <ErrorBox message={error} onRetry={load} />;
  if (!moto) return <Spinner />;
  const current = history.find((a) => a.is_current);

  return (
    <>
      <button onClick={() => nav(-1)} className="mb-4 inline-flex items-center gap-1 text-sm text-gray-400 hover:text-white">
        <ArrowLeft className="h-4 w-4" /> Volver
      </button>
      <Card className="mb-4">
        <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
          <div>
            <h1 className="text-2xl font-bold tracking-wide text-white">{moto.plate}</h1>
            <p className="text-gray-300">
              {moto.brand} {moto.model} {moto.year ?? ''} · {moto.color ?? 'Color no indicado'}
            </p>
            <p className="text-sm text-gray-500">{moto.code}</p>
            <div className="mt-2">
              {current ? (
                <Link to={`/conductores/${current.driver.id}`}>
                  <Badge className="bg-emerald-500/15 text-emerald-300 ring-emerald-500/30">
                    Asignada a {shortName(current.driver)} ({current.driver.code})
                  </Badge>
                </Link>
              ) : (
                <Badge className="bg-gray-500/20 text-gray-300 ring-gray-500/30">Sin conductor asignado</Badge>
              )}
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button variant="secondary" icon={Pencil} onClick={() => setModal('edit')}>
              Editar
            </Button>
            {!current && (
              <Button variant="secondary" icon={Link2} onClick={() => setModal('assign')}>
                Asignar a conductor
              </Button>
            )}
            <Button icon={FilePlus2} onClick={() => setModal('doc')}>
              Agregar documento
            </Button>
          </div>
        </div>
        <div className="mt-4 grid grid-cols-3 gap-3">
          {[
            ['Frontal', moto.photo_front_path],
            ['Lateral', moto.photo_side_path],
            ['Placa', moto.photo_plate_path],
          ].map(([label, path]) => (
            <figure key={label}>
              <SignedImage path={path} alt={`Foto ${label}`} fallback="image" className="aspect-[4/3] w-full rounded-xl" />
              <figcaption className="mt-1 text-center text-xs text-gray-500">{label}</figcaption>
            </figure>
          ))}
        </div>
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <h2 className="mb-2 font-semibold text-white">Datos de la motocicleta</h2>
          <dl className="divide-y divide-ink-600">
            <InfoRow label="Serial de chasis">{moto.chassis_serial}</InfoRow>
            <InfoRow label="Serial de motor">{moto.engine_serial}</InfoRow>
            <InfoRow label="Cilindrada">{moto.displacement_cc ? `${moto.displacement_cc} cc` : null}</InfoRow>
            <InfoRow label="Propietario">{moto.owner_name}</InfoRow>
            <InfoRow label="Doc. propietario">{moto.owner_id_doc}</InfoRow>
            <InfoRow label="Observaciones">{moto.notes}</InfoRow>
          </dl>
        </Card>
        <Card>
          <h2 className="mb-3 font-semibold text-white">Historial de asignaciones</h2>
          {history.length === 0 ? (
            <p className="text-sm text-gray-500">Nunca ha sido asignada.</p>
          ) : (
            <ul className="space-y-2">
              {history.map((a) => (
                <li key={a.id} className="rounded-xl bg-ink-900/50 p-3 text-sm ring-1 ring-ink-600">
                  <Link to={`/conductores/${a.driver.id}`} className="font-medium text-white hover:text-yummy-200">
                    {shortName(a.driver)}
                  </Link>{' '}
                  <span className="text-xs text-gray-500">{cedula(a.driver)}</span> <StatusBadge status={a.driver.status} />
                  <p className="text-xs text-gray-400">
                    {fmtDate(a.start_date)} → {a.end_date ? fmtDate(a.end_date) : 'actual'} {a.end_reason ? `· ${a.end_reason}` : ''}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>

      <Card className="mt-4">
        <h2 className="mb-3 font-semibold text-white">Documentos de la motocicleta</h2>
        <DocumentList ownerType="motorcycle" ownerId={moto.id} driverIdForAudit={current?.driver.id} refreshKey={docsKey} />
      </Card>

      <Modal open={modal === 'edit'} onClose={() => setModal(null)} title="Editar motocicleta" wide>
        <MotorcycleEditor
          initial={moto}
          onSaved={() => {
            toast('success', 'Motocicleta actualizada.');
            setModal(null);
            void load();
          }}
        />
      </Modal>
      <Modal open={modal === 'doc'} onClose={() => setModal(null)} title="Agregar documento de la motocicleta">
        <DocumentUploadForm
          ownerType="motorcycle"
          ownerId={moto.id}
          onDone={() => {
            setModal(null);
            setDocsKey((k) => k + 1);
          }}
        />
      </Modal>
      <AssignDriverModal
        open={modal === 'assign'}
        moto={moto}
        onClose={() => setModal(null)}
        onDone={() => {
          setModal(null);
          void load();
        }}
      />
    </>
  );
}

function AssignDriverModal({ open, moto, onClose, onDone }: { open: boolean; moto: Motorcycle; onClose: () => void; onDone: () => void }) {
  const toast = useToast();
  const [q, setQ] = useState('');
  const [results, setResults] = useState<Driver[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  useEffect(() => {
    const term = searchTerm(q).replace(/\./g, '');
    if (term.length < 2) return setResults([]);
    const t = setTimeout(async () => {
      let query = supabase.from('drivers').select('*').neq('status', 'retirado').eq('is_draft', false);
      for (const w of term.split(' ')) query = query.ilike('search_text', `%${w}%`);
      const { data } = await query.limit(8);
      setResults((data ?? []) as Driver[]);
    }, 300);
    return () => clearTimeout(t);
  }, [q]);

  async function assign(d: Driver) {
    setBusy(d.id);
    const { error } = await supabase.rpc('assign_motorcycle', {
      p_driver_id: d.id,
      p_motorcycle_id: moto.id,
      p_start_date: todayISO(),
      p_notes: null,
    });
    setBusy(null);
    if (error) return toast('error', friendlyError(error));
    toast('success', `Moto ${moto.plate} asignada a ${shortName(d)}. Si tenía otra moto, quedó en su historial.`);
    onDone();
  }

  return (
    <Modal open={open} onClose={onClose} title={`Asignar ${moto.plate} a un conductor`}>
      <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Nombre, cédula o código del conductor…" autoFocus />
      <ul className="mt-3 space-y-2">
        {results.map((d) => (
          <li key={d.id} className="flex items-center justify-between gap-2 rounded-xl bg-ink-900/60 p-3 ring-1 ring-ink-600">
            <span className="text-sm text-white">
              {shortName(d)} <span className="text-gray-500">· {cedula(d)}</span>
            </span>
            <Button size="sm" loading={busy === d.id} onClick={() => assign(d)}>
              Asignar
            </Button>
          </li>
        ))}
      </ul>
    </Modal>
  );
}
