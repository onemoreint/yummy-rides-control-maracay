import { Plus, Save } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { loadDocTypes } from '../components/DocumentsPanel';
import { Badge, Button, Card, ErrorBox, Field, Input, PageHeader, Select, Spinner, useToast } from '../components/ui';
import { friendlyError, supabase } from '../lib/supabase';
import type { DocOwner, DocumentType } from '../lib/types';

export default function SettingsPage() {
  const toast = useToast();
  const [types, setTypes] = useState<DocumentType[] | null>(null);
  const [opStatus, setOpStatus] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [label, setLabel] = useState('');
  const [appliesTo, setAppliesTo] = useState<DocOwner>('driver');
  const [hasExpiry, setHasExpiry] = useState(false);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setError(null);
    try {
      const [t, s] = await Promise.all([loadDocTypes(true), supabase.from('system_settings').select('*').eq('key', 'operator_can_change_status').maybeSingle()]);
      setTypes(t);
      setOpStatus(s.data?.value === true);
    } catch (e) {
      setError(friendlyError(e));
    }
  }, []);
  useEffect(() => {
    void load();
  }, [load]);

  async function saveOpStatus(v: boolean) {
    const { error } = await supabase.from('system_settings').upsert({ key: 'operator_can_change_status', value: v });
    if (error) return toast('error', friendlyError(error));
    setOpStatus(v);
    toast('success', 'Configuración guardada.');
  }

  async function addType() {
    const l = label.trim();
    if (l.length < 3) return toast('error', 'Indique el nombre del tipo de documento.');
    const key = l
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '_')
      .replace(/(^_|_$)/g, '')
      .slice(0, 40);
    setBusy(true);
    const { error } = await supabase.from('document_types').insert({ key, label: l, applies_to: appliesTo, has_expiry: hasExpiry, sort_order: 80 });
    setBusy(false);
    if (error) return toast('error', friendlyError(error));
    setLabel('');
    setHasExpiry(false);
    toast('success', 'Tipo de documento agregado.');
    void load();
  }

  async function patchType(t: DocumentType, patch: Partial<DocumentType>) {
    const { error } = await supabase.from('document_types').update(patch).eq('key', t.key);
    if (error) return toast('error', friendlyError(error));
    void load();
  }

  if (error) return <ErrorBox message={error} onRetry={load} />;
  if (!types) return <Spinner />;

  return (
    <>
      <PageHeader title="Configuración del sistema" subtitle="Sólo el administrador principal puede modificar estos valores." />
      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <h2 className="mb-3 font-semibold text-white">Permisos de operadores</h2>
          <label className="flex items-start gap-3 text-sm text-gray-300">
            <input type="checkbox" className="mt-0.5 h-4 w-4 accent-yummy-500" checked={opStatus} onChange={(e) => saveOpStatus(e.target.checked)} />
            <span>
              Permitir que los operadores cambien el estado de afiliación de los conductores.
              <span className="block text-xs text-gray-500">Desactivado por defecto. El servidor lo verifica en cada cambio.</span>
            </span>
          </label>
        </Card>
        <Card>
          <h2 className="mb-3 font-semibold text-white">Nuevo tipo de documento</h2>
          <div className="space-y-3">
            <Field label="Nombre">
              <Input value={label} onChange={(e) => setLabel(e.target.value)} placeholder="Ej.: Constancia de residencia" />
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Aplica a">
                <Select value={appliesTo} onChange={(e) => setAppliesTo(e.target.value as DocOwner)}>
                  <option value="driver">Conductor</option>
                  <option value="motorcycle">Motocicleta</option>
                </Select>
              </Field>
              <label className="mt-7 flex items-center gap-2 text-sm text-gray-300">
                <input type="checkbox" className="h-4 w-4 accent-yummy-500" checked={hasExpiry} onChange={(e) => setHasExpiry(e.target.checked)} />
                Suele tener vencimiento
              </label>
            </div>
            <Button icon={Plus} loading={busy} onClick={addType}>
              Agregar tipo
            </Button>
          </div>
        </Card>
      </div>

      <Card className="mt-4">
        <h2 className="mb-3 font-semibold text-white">Tipos de documento</h2>
        <ul className="divide-y divide-ink-600">
          {types.map((t) => (
            <li key={t.key} className="flex flex-wrap items-center justify-between gap-2 py-2.5">
              <div>
                <p className="text-sm text-white">{t.label}</p>
                <p className="text-xs text-gray-500">
                  {t.applies_to === 'driver' ? 'Conductor' : 'Motocicleta'} · {t.has_expiry ? 'con vencimiento' : 'sin vencimiento'}
                </p>
              </div>
              <div className="flex items-center gap-2">
                {!t.active && <Badge className="bg-gray-500/20 text-gray-300 ring-gray-500/30">Inactivo</Badge>}
                <Button size="sm" variant="ghost" onClick={() => patchType(t, { has_expiry: !t.has_expiry })}>
                  {t.has_expiry ? 'Sin vencimiento' : 'Con vencimiento'}
                </Button>
                <Button size="sm" variant="secondary" icon={Save} onClick={() => patchType(t, { active: !t.active })}>
                  {t.active ? 'Desactivar' : 'Activar'}
                </Button>
              </div>
            </li>
          ))}
        </ul>
        <p className="mt-3 text-xs text-gray-500">Los tipos no se eliminan para no afectar documentos ya cargados; se desactivan.</p>
      </Card>
    </>
  );
}
