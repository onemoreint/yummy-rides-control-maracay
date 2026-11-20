import { ChevronLeft, ChevronRight, ShieldCheck } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Button, Card, EmptyState, ErrorBox, Input, PageHeader, Select, Spinner } from '../components/ui';
import { fmtDateTime } from '../lib/format';
import { friendlyError, supabase } from '../lib/supabase';
import type { AuditLog } from '../lib/types';

const PAGE = 50;
const ACTIONS: Record<string, string> = {
  INSERT: 'Creación',
  UPDATE: 'Edición',
  DELETE: 'Eliminación',
  STATUS_CHANGE: 'Cambio de estado',
  LOGIN: 'Inicio de sesión',
  LOGOUT: 'Cierre de sesión',
  EXPORT: 'Exportación',
  PRINT: 'Impresión',
  DOWNLOAD: 'Descarga',
  VIEW_DOCUMENT: 'Consulta de documento',
  RESET_PASSWORD: 'Cambio de contraseña',
};

export default function Audit() {
  const [rows, setRows] = useState<AuditLog[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [action, setAction] = useState('');
  const [user, setUser] = useState('');
  const [page, setPage] = useState(0);

  const load = useCallback(async () => {
    setError(null);
    setRows(null);
    let q = supabase.from('audit_logs').select('id,actor_email,action,table_name,summary,driver_id,created_at');
    if (action) q = q.eq('action', action);
    if (user.trim()) q = q.ilike('actor_email', `%${user.trim().replace(/[%_]/g, '')}%`);
    const { data, error } = await q.order('created_at', { ascending: false }).range(page * PAGE, page * PAGE + PAGE);
    if (error) return setError(friendlyError(error));
    setRows((data ?? []) as AuditLog[]);
  }, [action, user, page]);

  useEffect(() => {
    const t = setTimeout(() => void load(), 250);
    return () => clearTimeout(t);
  }, [load]);

  return (
    <>
      <PageHeader title="Registro de auditoría" subtitle="Inalterable: nadie puede editar ni borrar estos registros desde la aplicación." />
      <div className="mb-4 grid gap-3 sm:grid-cols-2">
        <Select value={action} onChange={(e) => { setAction(e.target.value); setPage(0); }} aria-label="Acción">
          <option value="">Todas las acciones</option>
          {Object.entries(ACTIONS).map(([k, v]) => (
            <option key={k} value={k}>
              {v}
            </option>
          ))}
        </Select>
        <Input value={user} onChange={(e) => { setUser(e.target.value); setPage(0); }} placeholder="Filtrar por correo del usuario" />
      </div>
      {error ? (
        <ErrorBox message={error} onRetry={load} />
      ) : !rows ? (
        <Spinner />
      ) : rows.length === 0 ? (
        <EmptyState icon={ShieldCheck} title="Sin registros" />
      ) : (
        <>
          <Card className="overflow-x-auto p-0 sm:p-0">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-ink-600 text-xs uppercase text-gray-400">
                <tr>
                  <th className="px-4 py-3">Fecha</th>
                  <th className="px-4 py-3">Usuario</th>
                  <th className="px-4 py-3">Acción</th>
                  <th className="px-4 py-3">Detalle</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-ink-600">
                {rows.slice(0, PAGE).map((r) => (
                  <tr key={r.id}>
                    <td className="whitespace-nowrap px-4 py-2.5 text-gray-400">{fmtDateTime(r.created_at)}</td>
                    <td className="px-4 py-2.5">{r.actor_email ?? 'sistema'}</td>
                    <td className="whitespace-nowrap px-4 py-2.5">{ACTIONS[r.action] ?? r.action}</td>
                    <td className="px-4 py-2.5 text-gray-200">
                      {r.driver_id ? (
                        <Link className="hover:text-yummy-200" to={`/conductores/${r.driver_id}?tab=historial`}>
                          {r.summary}
                        </Link>
                      ) : (
                        r.summary
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>
          <div className="mt-4 flex justify-center gap-3">
            <Button size="sm" variant="secondary" icon={ChevronLeft} disabled={page === 0} onClick={() => setPage((p) => p - 1)}>
              Anterior
            </Button>
            <Button size="sm" variant="secondary" disabled={rows.length <= PAGE} onClick={() => setPage((p) => p + 1)}>
              Siguiente <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </>
      )}
    </>
  );
}
