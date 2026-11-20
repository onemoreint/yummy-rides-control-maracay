import { Bike, Search, SkipForward } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { cedula, fmtDate, fullName, searchTerm, todayISO } from '../lib/format';
import { friendlyError, supabase } from '../lib/supabase';
import type { CurrentMoto, Driver, Motorcycle } from '../lib/types';
import MotorcycleEditor from './MotorcycleEditor';
import { Button, Input, Spinner, useToast } from './ui';

/** Registrar una moto nueva o asociar una existente a un conductor (conserva historial). */
export default function MotoAssigner({
  driver,
  allowSkip,
  onAssigned,
}: {
  driver: Driver;
  allowSkip?: boolean;
  onAssigned?: () => void;
}) {
  const toast = useToast();
  const [current, setCurrent] = useState<CurrentMoto | null | undefined>(undefined);
  const [mode, setMode] = useState<'none' | 'new' | 'existing'>('none');
  const [q, setQ] = useState('');
  const [results, setResults] = useState<Motorcycle[]>([]);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const { data } = await supabase.from('driver_current_motorcycle').select('*').eq('driver_id', driver.id).maybeSingle();
    setCurrent((data as CurrentMoto) ?? null);
  }, [driver.id]);
  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    const term = searchTerm(q);
    if (term.length < 2) return setResults([]);
    const t = setTimeout(async () => {
      const { data } = await supabase.from('motorcycles').select('*').ilike('search_text', `%${term}%`).limit(8);
      setResults((data ?? []) as Motorcycle[]);
    }, 300);
    return () => clearTimeout(t);
  }, [q]);

  async function assign(m: Motorcycle) {
    setBusy(true);
    const { error } = await supabase.rpc('assign_motorcycle', {
      p_driver_id: driver.id,
      p_motorcycle_id: m.id,
      p_start_date: current ? todayISO() : (driver.join_date ?? todayISO()),
      p_notes: null,
    });
    setBusy(false);
    if (error) return toast('error', friendlyError(error));
    toast('success', `Motocicleta ${m.plate} asignada.`);
    setMode('none');
    void load();
    onAssigned?.();
  }

  if (current === undefined) return <Spinner />;
  return (
    <div>
      {current ? (
        <div className="mb-4 flex items-center gap-3 rounded-xl bg-emerald-500/10 p-3 ring-1 ring-emerald-500/30">
          <Bike className="h-6 w-6 text-emerald-300" />
          <div className="text-sm">
            <p className="font-medium text-white">
              Moto actual: {current.plate} · {current.brand} {current.model}
            </p>
            <p className="text-xs text-gray-400">Asignada desde {fmtDate(current.start_date)}</p>
          </div>
        </div>
      ) : (
        <p className="mb-4 text-sm text-gray-400">
          Registre la motocicleta del conductor o asocie una ya registrada. Si aún no la tiene, puede omitir este paso.
        </p>
      )}
      <div className="mb-4 flex flex-wrap gap-2">
        <Button variant={mode === 'new' ? 'primary' : 'secondary'} onClick={() => setMode('new')}>
          {current ? 'Cambiar a moto nueva' : 'Registrar moto nueva'}
        </Button>
        <Button variant={mode === 'existing' ? 'primary' : 'secondary'} icon={Search} onClick={() => setMode('existing')}>
          Asociar moto existente
        </Button>
        {allowSkip && !current && (
          <Button variant="ghost" icon={SkipForward} onClick={() => setMode('none')}>
            Omitir por ahora
          </Button>
        )}
      </div>
      {mode === 'new' && (
        <MotorcycleEditor
          ownerSuggestion={{ name: fullName(driver), doc: cedula(driver) }}
          submitLabel={busy ? 'Guardando…' : 'Guardar y asignar al conductor'}
          onSaved={assign}
        />
      )}
      {mode === 'existing' && (
        <div>
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar por placa, marca o modelo…" autoFocus />
          <ul className="mt-3 space-y-2">
            {results.map((m) => (
              <li key={m.id} className="flex items-center justify-between rounded-xl bg-ink-900/60 p-3 ring-1 ring-ink-600">
                <span className="text-sm text-white">
                  {m.plate} · {m.brand} {m.model} <span className="text-gray-500">({m.code})</span>
                </span>
                <Button size="sm" loading={busy} onClick={() => assign(m)}>
                  Asociar
                </Button>
              </li>
            ))}
            {q.length >= 2 && results.length === 0 && <li className="text-sm text-gray-500">Sin coincidencias.</li>}
          </ul>
        </div>
      )}
    </div>
  );
}
