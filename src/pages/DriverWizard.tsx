import { zodResolver } from '@hookform/resolvers/zod';
import { ArrowLeft, ArrowRight, Check, CheckCircle2, Save } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { useForm, type Resolver } from 'react-hook-form';
import { useNavigate, useParams } from 'react-router-dom';
import { useAuth } from '../auth/AuthProvider';
import { DocumentList, DocumentUploadForm } from '../components/DocumentsPanel';
import MotoAssigner from '../components/MotoAssigner';
import { PhotoInput } from '../components/media';
import { Button, Card, cx, ErrorBox, Field, InfoRow, Input, PageHeader, Select, Spinner, Textarea, useConfirm, useToast } from '../components/ui';
import { uploadPrivate } from '../lib/files';
import { fmtDate, fmtPhone, fullName, STATUS_LABEL, todayISO } from '../lib/format';
import { friendlyError, supabase } from '../lib/supabase';
import type { AffiliationStatus, CurrentMoto, Driver } from '../lib/types';
import {
  driverContactSchema,
  driverPersonalSchema,
  driverSchema,
  MUNICIPIOS_ARAGUA,
  normalizePhone,
  nullify,
  type DriverFormValues,
} from '../lib/validation';

const STEPS = ['Datos personales', 'Contacto y dirección', 'Motocicleta', 'Documentos', 'Revisión'];
const STEP1_FIELDS = ['first_name', 'middle_name', 'last_name', 'second_last_name', 'id_prefix', 'id_number', 'birth_date', 'join_date'] as const;
const STEP2_FIELDS = [
  'phone',
  'whatsapp',
  'address',
  'municipality',
  'parish',
  'state',
  'emergency_name',
  'emergency_relationship',
  'emergency_phone',
  'internal_notes',
] as const;

function toForm(d?: Driver | null): DriverFormValues {
  return {
    first_name: d?.first_name ?? '',
    middle_name: d?.middle_name ?? '',
    last_name: d?.last_name ?? '',
    second_last_name: d?.second_last_name ?? '',
    id_prefix: d?.id_prefix ?? 'V',
    id_number: d?.id_number ?? '',
    birth_date: d?.birth_date ?? '',
    join_date: d?.join_date ?? todayISO(),
    phone: d?.phone ?? '',
    whatsapp: d?.whatsapp ?? '',
    address: d?.address ?? '',
    municipality: d?.municipality ?? '',
    parish: d?.parish ?? '',
    state: d?.state ?? 'Aragua',
    emergency_name: d?.emergency_name ?? '',
    emergency_relationship: d?.emergency_relationship ?? '',
    emergency_phone: d?.emergency_phone ?? '',
    internal_notes: d?.internal_notes ?? '',
  };
}

export default function DriverWizard() {
  const { id } = useParams();
  const nav = useNavigate();
  const toast = useToast();
  const confirm = useConfirm();
  const { isAdmin } = useAuth();
  const [driver, setDriver] = useState<Driver | null>(null);
  const [loading, setLoading] = useState(!!id);
  const [step, setStep] = useState(0);
  const [photo, setPhoto] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [initialStatus, setInitialStatus] = useState<AffiliationStatus>('pendiente');
  const [docsKey, setDocsKey] = useState(0);

  const form = useForm<DriverFormValues>({
    resolver: zodResolver(driverSchema) as unknown as Resolver<DriverFormValues>,
    defaultValues: toForm(null),
    mode: 'onTouched',
  });
  const { register, trigger, getValues, reset, formState } = form;
  const errors = formState.errors;
  const editingComplete = !!driver && !driver.is_draft;

  useEffect(() => {
    if (!id) return;
    (async () => {
      const { data, error } = await supabase.from('drivers').select('*').eq('id', id).maybeSingle();
      if (error || !data) {
        setError(error ? friendlyError(error) : 'Conductor no encontrado.');
      } else {
        const d = data as Driver;
        setDriver(d);
        reset(toForm(d));
        if (d.is_draft && d.draft_step != null) setStep(Math.min(d.draft_step, 4));
      }
      setLoading(false);
    })();
  }, [id, reset]);

  /** Guarda el paso actual. Devuelve el conductor guardado o null si hubo error. */
  const persist = useCallback(
    async (nextStep: number): Promise<Driver | null> => {
      setError(null);
      const values = getValues();
      const p = driverPersonalSchema.safeParse(values);
      if (!p.success) {
        await trigger([...STEP1_FIELDS]);
        setStep(0);
        return null;
      }
      const c = driverContactSchema.safeParse(values);
      const payload: Record<string, unknown> = {
        ...nullify(p.data),
        first_name: p.data.first_name,
        last_name: p.data.last_name,
        id_prefix: p.data.id_prefix,
        id_number: p.data.id_number,
      };
      // Campos del paso 2: se guardan aunque estén incompletos (borrador)
      const rawContact = c.success ? c.data : values;
      for (const k of STEP2_FIELDS) {
        const v = (rawContact as Record<string, unknown>)[k];
        let val = typeof v === 'string' && v.trim() ? v.trim() : null;
        if (val && /phone|whatsapp/.test(k)) {
          val = normalizePhone(val);
          if (!/^\+?[0-9]{7,15}$/.test(val)) val = null; // en borrador se descarta un teléfono incompleto
        }
        payload[k] = val;
      }
      if (!editingComplete) {
        payload.is_draft = true;
        payload.draft_step = nextStep;
      }
      setBusy(true);
      try {
        let saved: Driver;
        if (driver) {
          const { data, error } = await supabase.from('drivers').update(payload).eq('id', driver.id).select().single();
          if (error) throw error;
          saved = data as Driver;
        } else {
          const { data, error } = await supabase.from('drivers').insert(payload).select().single();
          if (error) throw error;
          saved = data as Driver;
        }
        if (photo) {
          const path = await uploadPrivate(`drivers/${saved.id}/photo`, photo);
          const { data, error } = await supabase.from('drivers').update({ photo_path: path }).eq('id', saved.id).select().single();
          if (error) throw error;
          saved = data as Driver;
          setPhoto(null);
        }
        setDriver(saved);
        return saved;
      } catch (e) {
        setError(friendlyError(e));
        return null;
      } finally {
        setBusy(false);
      }
    },
    [driver, editingComplete, getValues, photo, trigger],
  );

  async function next() {
    if (step === 0 && !(await trigger([...STEP1_FIELDS]))) return;
    if (step === 1 && !(await trigger([...STEP2_FIELDS]))) return;
    if (step <= 1) {
      const saved = await persist(step + 1);
      if (!saved) return;
      if (editingComplete && step === 1) {
        toast('success', 'Expediente actualizado.');
        return nav(`/conductores/${saved.id}`);
      }
    } else if (driver && !editingComplete) {
      await supabase.from('drivers').update({ draft_step: step + 1 }).eq('id', driver.id);
    }
    setStep((s) => s + 1);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  async function saveDraftAndExit() {
    const saved = step <= 1 ? await persist(step) : driver;
    if (!saved) return;
    if (step > 1 && !editingComplete) await supabase.from('drivers').update({ draft_step: step }).eq('id', saved.id);
    toast('info', editingComplete ? 'Cambios guardados.' : 'Borrador guardado. Puede continuarlo desde "Conductores → Borradores".');
    nav(editingComplete ? `/conductores/${saved.id}` : '/conductores?estado=borrador');
  }

  async function finish() {
    if (!driver) return;
    const ok = driverSchema.safeParse(getValues());
    if (!ok.success) {
      await trigger();
      setError('Faltan datos obligatorios. Revise los pasos 1 y 2.');
      return;
    }
    const go = await confirm({
      title: 'Confirmar registro',
      message: `Se completará el expediente de ${fullName(driver)} (${driver.code}).`,
      confirmText: 'Registrar conductor',
    });
    if (!go) return;
    setBusy(true);
    const { error } = await supabase.from('drivers').update({ is_draft: false }).eq('id', driver.id);
    if (error) {
      setBusy(false);
      return setError(friendlyError(error));
    }
    if (isAdmin && initialStatus !== 'pendiente') {
      const { error: e2 } = await supabase.rpc('change_driver_status', {
        p_driver_id: driver.id,
        p_new_status: initialStatus,
        p_reason: 'Estado asignado al completar el registro',
        p_notes: null,
        p_effective_date: driver.join_date ?? todayISO(),
      });
      if (e2) toast('error', friendlyError(e2));
    }
    setBusy(false);
    toast('success', 'Conductor registrado correctamente.');
    nav(`/conductores/${driver.id}`);
  }

  if (loading) return <Spinner />;
  const visibleSteps = editingComplete ? STEPS.slice(0, 2) : STEPS;

  return (
    <>
      <PageHeader
        title={editingComplete ? 'Editar expediente' : driver ? `Registro ${driver.code}` : 'Registrar conductor'}
        subtitle={driver ? fullName(driver) : 'Complete los pasos. Puede guardar como borrador y continuar después.'}
      />

      {/* Indicador de pasos */}
      <ol className="mb-6 flex gap-2 overflow-x-auto pb-1">
        {visibleSteps.map((label, i) => (
          <li key={label} className="flex min-w-fit items-center gap-2">
            <span
              className={cx(
                'flex h-7 w-7 items-center justify-center rounded-full text-xs font-bold ring-1',
                i < step && 'bg-yummy-500 text-white ring-yummy-400',
                i === step && 'bg-yummy-900 text-white ring-yummy-400',
                i > step && 'bg-ink-800 text-gray-500 ring-ink-500',
              )}
            >
              {i < step ? <Check className="h-4 w-4" /> : i + 1}
            </span>
            <span className={cx('whitespace-nowrap text-sm', i === step ? 'text-white' : 'text-gray-500')}>{label}</span>
            {i < visibleSteps.length - 1 && <span className="mx-1 h-px w-6 bg-ink-500" />}
          </li>
        ))}
      </ol>

      {error && (
        <div className="mb-4">
          <ErrorBox message={error} />
        </div>
      )}

      {step === 0 && (
        <Card>
          <div className="grid gap-6 lg:grid-cols-[auto,1fr]">
            <PhotoInput label="Fotografía del conductor" round file={photo} existingPath={driver?.photo_path} onChange={setPhoto} />
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Primer nombre" required error={errors.first_name?.message}>
                <Input {...register('first_name')} invalid={!!errors.first_name} autoComplete="off" />
              </Field>
              <Field label="Segundo nombre">
                <Input {...register('middle_name')} autoComplete="off" />
              </Field>
              <Field label="Primer apellido" required error={errors.last_name?.message}>
                <Input {...register('last_name')} invalid={!!errors.last_name} autoComplete="off" />
              </Field>
              <Field label="Segundo apellido">
                <Input {...register('second_last_name')} autoComplete="off" />
              </Field>
              <Field label="Cédula de identidad" required error={errors.id_number?.message ?? errors.id_prefix?.message}>
                <div className="flex gap-2">
                  <Select {...register('id_prefix')} className="w-20" aria-label="Nacionalidad">
                    <option value="V">V</option>
                    <option value="E">E</option>
                  </Select>
                  <Input {...register('id_number')} inputMode="numeric" invalid={!!errors.id_number} placeholder="12345678" />
                </div>
              </Field>
              <Field label="Fecha de nacimiento" error={errors.birth_date?.message} hint="Opcional">
                <Input type="date" {...register('birth_date')} invalid={!!errors.birth_date} />
              </Field>
              <Field label="Fecha de ingreso a la línea" required error={errors.join_date?.message}>
                <Input type="date" {...register('join_date')} invalid={!!errors.join_date} />
              </Field>
            </div>
          </div>
        </Card>
      )}

      {step === 1 && (
        <Card>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Teléfono principal" required error={errors.phone?.message} hint="Ej.: 04141234567 o +584141234567">
              <Input {...register('phone')} type="tel" inputMode="tel" invalid={!!errors.phone} />
            </Field>
            <Field label="WhatsApp" error={errors.whatsapp?.message} hint="Si es distinto al principal">
              <Input {...register('whatsapp')} type="tel" inputMode="tel" invalid={!!errors.whatsapp} />
            </Field>
            <Field label="Dirección de habitación" required error={errors.address?.message} className="sm:col-span-2">
              <Textarea {...register('address')} rows={2} invalid={!!errors.address} />
            </Field>
            <Field label="Estado" required error={errors.state?.message}>
              <Input {...register('state')} invalid={!!errors.state} />
            </Field>
            <Field label="Municipio" required error={errors.municipality?.message}>
              <Input {...register('municipality')} list="municipios" invalid={!!errors.municipality} />
              <datalist id="municipios">
                {MUNICIPIOS_ARAGUA.map((m) => (
                  <option key={m} value={m} />
                ))}
              </datalist>
            </Field>
            <Field label="Parroquia" required error={errors.parish?.message}>
              <Input {...register('parish')} invalid={!!errors.parish} />
            </Field>
          </div>
          <h3 className="mb-3 mt-6 text-sm font-semibold uppercase tracking-wide text-yummy-300">Contacto de emergencia</h3>
          <div className="grid gap-4 sm:grid-cols-3">
            <Field label="Nombre completo">
              <Input {...register('emergency_name')} />
            </Field>
            <Field label="Parentesco">
              <Input {...register('emergency_relationship')} placeholder="Madre, esposa, hermano…" />
            </Field>
            <Field label="Teléfono" error={errors.emergency_phone?.message}>
              <Input {...register('emergency_phone')} type="tel" inputMode="tel" invalid={!!errors.emergency_phone} />
            </Field>
          </div>
          <Field label="Observaciones internas" className="mt-4" hint="Sólo visibles para el personal administrativo">
            <Textarea {...register('internal_notes')} />
          </Field>
        </Card>
      )}

      {step === 2 && driver && (
        <Card>
          <MotoAssigner driver={driver} allowSkip />
        </Card>
      )}

      {step === 3 && driver && (
        <div className="grid gap-4 lg:grid-cols-2">
          <Card>
            <h3 className="mb-4 font-semibold text-white">Agregar documento del conductor</h3>
            <DocumentUploadForm ownerType="driver" ownerId={driver.id} onDone={() => setDocsKey((k) => k + 1)} />
          </Card>
          <Card>
            <h3 className="mb-4 font-semibold text-white">Documentos cargados</h3>
            <DocumentList ownerType="driver" ownerId={driver.id} driverIdForAudit={driver.id} refreshKey={docsKey} />
            <p className="mt-3 text-xs text-gray-500">Los documentos de la motocicleta se cargan desde su ficha.</p>
          </Card>
        </div>
      )}

      {step === 4 && driver && <ReviewStep driver={driver} values={getValues()} />}

      {step === 4 && isAdmin && (
        <Card className="mt-4">
          <Field label="Estado de afiliación al completar" hint="Sólo el administrador puede asignarlo">
            <Select value={initialStatus} onChange={(e) => setInitialStatus(e.target.value as AffiliationStatus)} className="sm:w-64">
              <option value="pendiente">Pendiente</option>
              <option value="activo">Activo</option>
            </Select>
          </Field>
        </Card>
      )}

      {/* Navegación del asistente */}
      <div className="sticky bottom-16 z-20 mt-6 flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-ink-600 bg-ink-800/95 p-3 backdrop-blur lg:bottom-4">
        <Button variant="ghost" icon={ArrowLeft} disabled={step === 0 || busy} onClick={() => setStep((s) => s - 1)}>
          Atrás
        </Button>
        <div className="flex flex-wrap gap-2">
          <Button variant="secondary" icon={Save} onClick={saveDraftAndExit} loading={busy && step <= 1}>
            {editingComplete ? 'Guardar y salir' : 'Guardar borrador'}
          </Button>
          {step < (editingComplete ? 1 : 4) && (
            <Button onClick={next} loading={busy}>
              {step === 2 || step === 3 ? 'Continuar' : 'Siguiente'} <ArrowRight className="h-4 w-4" />
            </Button>
          )}
          {editingComplete && step === 1 && (
            <Button onClick={next} loading={busy} icon={Save}>
              Guardar cambios
            </Button>
          )}
          {!editingComplete && step === 4 && (
            <Button onClick={finish} loading={busy} icon={CheckCircle2}>
              Confirmar registro
            </Button>
          )}
        </div>
      </div>
    </>
  );
}

/* ------------------------------ Paso 5: revisión ------------------------------ */
function ReviewStep({ driver, values }: { driver: Driver; values: DriverFormValues }) {
  const [moto, setMoto] = useState<CurrentMoto | null>(null);
  const [docs, setDocs] = useState(0);
  useEffect(() => {
    (async () => {
      const [{ data: m }, { count }] = await Promise.all([
        supabase.from('driver_current_motorcycle').select('*').eq('driver_id', driver.id).maybeSingle(),
        supabase.from('documents').select('id', { count: 'exact', head: true }).eq('driver_id', driver.id),
      ]);
      setMoto((m as CurrentMoto) ?? null);
      setDocs(count ?? 0);
    })();
  }, [driver.id]);
  return (
    <Card>
      <h3 className="mb-2 font-semibold text-white">Revise los datos antes de confirmar</h3>
      <dl className="divide-y divide-ink-600">
        <InfoRow label="Código">{driver.code}</InfoRow>
        <InfoRow label="Nombre completo">{fullName({ ...driver, ...values } as Driver)}</InfoRow>
        <InfoRow label="Cédula">{`${values.id_prefix}-${values.id_number}`}</InfoRow>
        <InfoRow label="Fecha de ingreso">{fmtDate(values.join_date)}</InfoRow>
        <InfoRow label="Teléfono">{fmtPhone(values.phone)}</InfoRow>
        <InfoRow label="WhatsApp">{fmtPhone(values.whatsapp)}</InfoRow>
        <InfoRow label="Dirección">{[values.address, values.parish, values.municipality, values.state].filter(Boolean).join(', ')}</InfoRow>
        <InfoRow label="Emergencia">
          {values.emergency_name ? `${values.emergency_name} (${values.emergency_relationship || '—'}) ${fmtPhone(values.emergency_phone)}` : '—'}
        </InfoRow>
        <InfoRow label="Motocicleta">{moto ? `${moto.plate} · ${moto.brand} ${moto.model}` : 'Sin motocicleta asignada'}</InfoRow>
        <InfoRow label="Documentos">{`${docs} cargado(s)`}</InfoRow>
        <InfoRow label="Estado inicial">{STATUS_LABEL[driver.status]}</InfoRow>
      </dl>
    </Card>
  );
}
