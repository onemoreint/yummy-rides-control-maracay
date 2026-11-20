import { Bike, Plus, Search } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import MotorcycleEditor from '../components/MotorcycleEditor';
import { SignedImage } from '../components/media';
import { Badge, Button, Card, EmptyState, ErrorBox, Modal, PageHeader, Spinner, useToast } from '../components/ui';
import { searchTerm } from '../lib/format';
import { friendlyError, supabase } from '../lib/supabase';
import type { Motorcycle } from '../lib/types';

type Row = Motorcycle & {
  current: { driver: { id: string; first_name: string; last_name: string; code: string } | null }[];
};

export default function Motorcycles() {
  const nav = useNavigate();
  const toast = useToast();
  const [params, setParams] = useSearchParams();
  const [q, setQ] = useState('');
  const [rows, setRows] = useState<Row[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const creating = params.get('nueva') === '1';

  const load = useCallback(async () => {
    setError(null);
    let query = supabase
      .from('motorcycles')
      .select('*, current:driver_motorcycle_assignments(driver:drivers(id,first_name,last_name,code))')
      .eq('current.is_current', true)
      .order('created_at', { ascending: false })
      .limit(200);
    for (const w of searchTerm(q).split(' ').filter(Boolean)) query = query.ilike('search_text', `%${w}%`);
    const { data, error } = await query;
    if (error) return setError(friendlyError(error));
    setRows((data ?? []) as Row[]);
  }, [q]);

  useEffect(() => {
    const t = setTimeout(() => void load(), 300);
    return () => clearTimeout(t);
  }, [load]);

  return (
    <>
      <PageHeader
        title="Motocicletas"
        subtitle={rows ? `${rows.length} registro(s)${rows.length === 200 ? ' (mostrando 200; afine la búsqueda)' : ''}` : undefined}
        actions={
          <Button icon={Plus} onClick={() => setParams({ nueva: '1' })}>
            Registrar motocicleta
          </Button>
        }
      />
      <div className="relative mb-4">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-500" />
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Buscar por placa, marca, modelo o propietario…"
          className="w-full rounded-xl border border-ink-500 bg-ink-800 py-2.5 pl-10 pr-3 text-sm text-white placeholder:text-gray-500 focus:border-yummy-400 focus:outline-none focus:ring-2 focus:ring-yummy-500/40"
          aria-label="Buscar motocicletas"
        />
      </div>

      {error ? (
        <ErrorBox message={error} onRetry={load} />
      ) : !rows ? (
        <Spinner />
      ) : rows.length === 0 ? (
        <EmptyState
          icon={Bike}
          title={q ? 'Sin resultados' : 'Aún no hay motocicletas'}
          text={q ? 'Pruebe con otra placa o marca.' : 'Registre una motocicleta o hágalo desde el asistente de conductores.'}
        />
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {rows.map((m) => {
            const drv = m.current?.[0]?.driver;
            return (
              <Link key={m.id} to={`/motocicletas/${m.id}`}>
                <Card className="flex gap-3 p-3 transition hover:border-yummy-600 sm:p-3">
                  <SignedImage path={m.photo_front_path} alt={m.plate} fallback="image" className="h-20 w-24 shrink-0 rounded-xl" />
                  <div className="min-w-0 text-sm">
                    <p className="font-bold tracking-wide text-white">{m.plate}</p>
                    <p className="truncate text-gray-300">
                      {m.brand} {m.model} {m.year ?? ''}
                    </p>
                    <p className="text-xs text-gray-500">{m.code}</p>
                    {drv ? (
                      <Badge className="mt-1 bg-emerald-500/15 text-emerald-300 ring-emerald-500/30">
                        {drv.first_name} {drv.last_name}
                      </Badge>
                    ) : (
                      <Badge className="mt-1 bg-gray-500/20 text-gray-300 ring-gray-500/30">Sin conductor</Badge>
                    )}
                  </div>
                </Card>
              </Link>
            );
          })}
        </div>
      )}

      <Modal open={creating} onClose={() => setParams({})} title="Registrar motocicleta" wide>
        <p className="mb-4 text-sm text-gray-400">
          Para asociarla a un conductor, use luego «Registrar motocicleta» en su expediente o en la ficha de la moto.
        </p>
        <MotorcycleEditor
          onSaved={(m) => {
            toast('success', `Motocicleta ${m.plate} registrada.`);
            nav(`/motocicletas/${m.id}`);
          }}
        />
      </Modal>
    </>
  );
}
