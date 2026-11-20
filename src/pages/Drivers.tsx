import { ChevronLeft, ChevronRight, Plus, Search, Users } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { SignedImage } from '../components/media';
import { Button, Card, cx, EmptyState, ErrorBox, PageHeader, Spinner, StatusBadge } from '../components/ui';
import { cedula, fmtDate, fmtPhone, searchTerm, shortName } from '../lib/format';
import { friendlyError, supabase } from '../lib/supabase';
import type { CurrentMoto, Driver } from '../lib/types';

const PAGE = 25;
const FILTERS = [
  { id: '', label: 'Todos' },
  { id: 'activo', label: 'Activos' },
  { id: 'pendiente', label: 'Pendientes' },
  { id: 'suspendido', label: 'Suspendidos' },
  { id: 'retirado', label: 'Retirados' },
  { id: 'borrador', label: 'Borradores' },
];

export default function Drivers() {
  const nav = useNavigate();
  const [params, setParams] = useSearchParams();
  const q = params.get('q') ?? '';
  const estado = params.get('estado') ?? '';
  const page = Number(params.get('p') ?? '0');
  const [input, setInput] = useState(q);
  const [rows, setRows] = useState<Driver[] | null>(null);
  const [motos, setMotos] = useState<Record<string, CurrentMoto>>({});
  const [total, setTotal] = useState(0);
  const [error, setError] = useState<string | null>(null);

  const setParam = (k: string, v: string) => {
    const n = new URLSearchParams(params);
    if (v) n.set(k, v);
    else n.delete(k);
    if (k !== 'p') n.delete('p');
    setParams(n, { replace: true });
  };

  // Búsqueda con espera breve mientras se escribe
  useEffect(() => {
    const t = setTimeout(() => input !== q && setParam('q', input.trim()), 350);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [input]);

  const load = useCallback(async () => {
    setError(null);
    setRows(null);
    let query = supabase.from('drivers').select('*', { count: 'exact' });
    if (estado === 'borrador') query = query.eq('is_draft', true);
    else if (estado) query = query.eq('status', estado).eq('is_draft', false);
    for (const word of searchTerm(q).split(' ').filter(Boolean)) {
      query = query.ilike('search_text', `%${word.replace(/\./g, '')}%`);
    }
    const { data, error, count } = await query
      .order('last_name')
      .order('first_name')
      .range(page * PAGE, page * PAGE + PAGE - 1);
    if (error) return setError(friendlyError(error));
    const list = (data ?? []) as Driver[];
    setRows(list);
    setTotal(count ?? 0);
    if (list.length) {
      const { data: m } = await supabase
        .from('driver_current_motorcycle')
        .select('*')
        .in(
          'driver_id',
          list.map((d) => d.id),
        );
      setMotos(Object.fromEntries(((m ?? []) as CurrentMoto[]).map((x) => [x.driver_id, x])));
    }
  }, [q, estado, page]);

  useEffect(() => {
    void load();
  }, [load]);

  const pages = Math.max(1, Math.ceil(total / PAGE));

  return (
    <>
      <PageHeader
        title="Conductores"
        subtitle={rows ? `${total} registro(s)` : undefined}
        actions={
          <Button icon={Plus} onClick={() => nav('/conductores/nuevo')}>
            Registrar conductor
          </Button>
        }
      />

      <div className="mb-4 flex flex-col gap-3">
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-500" />
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Nombre, cédula (V12345678) o código (YR-0001)…"
            className="w-full rounded-xl border border-ink-500 bg-ink-800 py-2.5 pl-10 pr-3 text-sm text-white placeholder:text-gray-500 focus:border-yummy-400 focus:outline-none focus:ring-2 focus:ring-yummy-500/40"
            aria-label="Buscar conductores"
          />
        </div>
        <div className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1">
          {FILTERS.map((f) => (
            <button
              key={f.id}
              onClick={() => setParam('estado', f.id)}
              className={cx(
                'whitespace-nowrap rounded-full px-3.5 py-1.5 text-sm ring-1 transition',
                estado === f.id ? 'bg-yummy-500 text-white ring-yummy-400' : 'bg-ink-800 text-gray-300 ring-ink-500 hover:ring-yummy-600',
              )}
            >
              {f.label}
            </button>
          ))}
        </div>
      </div>

      {error ? (
        <ErrorBox message={error} onRetry={load} />
      ) : !rows ? (
        <Spinner />
      ) : rows.length === 0 ? (
        <EmptyState
          icon={Users}
          title={q || estado ? 'Sin resultados' : 'Aún no hay conductores'}
          text={q || estado ? 'Pruebe con otro término o filtro.' : 'Registre el primer conductor de la línea.'}
          action={
            !q && !estado ? (
              <Button icon={Plus} onClick={() => nav('/conductores/nuevo')}>
                Registrar conductor
              </Button>
            ) : undefined
          }
        />
      ) : (
        <>
          {/* Tabla escritorio */}
          <Card className="hidden overflow-x-auto p-0 sm:p-0 md:block">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-ink-600 text-xs uppercase tracking-wide text-gray-400">
                <tr>
                  <th className="px-4 py-3">Conductor</th>
                  <th className="px-4 py-3">Cédula</th>
                  <th className="px-4 py-3">Teléfono</th>
                  <th className="px-4 py-3">Moto actual</th>
                  <th className="px-4 py-3">Ingreso</th>
                  <th className="px-4 py-3">Estado</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-ink-600">
                {rows.map((d) => (
                  <tr
                    key={d.id}
                    onClick={() => nav(d.is_draft ? `/conductores/${d.id}/editar` : `/conductores/${d.id}`)}
                    className="cursor-pointer hover:bg-ink-700/50"
                  >
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-3">
                        <SignedImage path={d.photo_path} alt={shortName(d)} className="h-9 w-9 rounded-full" />
                        <div>
                          <p className="font-medium text-white">{shortName(d)}</p>
                          <p className="text-xs text-gray-500">{d.code}</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3 tabular-nums">{cedula(d)}</td>
                    <td className="px-4 py-3">{fmtPhone(d.phone)}</td>
                    <td className="px-4 py-3">{motos[d.id] ? `${motos[d.id].plate} · ${motos[d.id].brand}` : <span className="text-gray-500">—</span>}</td>
                    <td className="px-4 py-3">{fmtDate(d.join_date)}</td>
                    <td className="px-4 py-3">
                      <StatusBadge status={d.status} draft={d.is_draft} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>

          {/* Tarjetas móvil */}
          <ul className="space-y-2 md:hidden">
            {rows.map((d) => (
              <li key={d.id}>
                <Link
                  to={d.is_draft ? `/conductores/${d.id}/editar` : `/conductores/${d.id}`}
                  className="flex items-center gap-3 rounded-2xl border border-ink-600 bg-ink-800 p-3"
                >
                  <SignedImage path={d.photo_path} alt={shortName(d)} className="h-12 w-12 shrink-0 rounded-full" />
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-medium text-white">{shortName(d)}</p>
                    <p className="text-xs text-gray-400">
                      {d.code} · {cedula(d)}
                    </p>
                    {motos[d.id] && <p className="text-xs text-gray-500">Moto: {motos[d.id].plate}</p>}
                  </div>
                  <StatusBadge status={d.status} draft={d.is_draft} />
                </Link>
              </li>
            ))}
          </ul>

          {pages > 1 && (
            <div className="mt-4 flex items-center justify-center gap-3 text-sm">
              <Button variant="secondary" size="sm" icon={ChevronLeft} disabled={page === 0} onClick={() => setParam('p', String(page - 1))}>
                Anterior
              </Button>
              <span className="text-gray-400">
                Página {page + 1} de {pages}
              </span>
              <Button variant="secondary" size="sm" disabled={page + 1 >= pages} onClick={() => setParam('p', String(page + 1))}>
                Siguiente <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          )}
        </>
      )}
    </>
  );
}
