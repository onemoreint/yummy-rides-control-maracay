import { FileCheck2, FileWarning } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { loadDocTypes } from '../components/DocumentsPanel';
import { Card, cx, EmptyState, ErrorBox, PageHeader, ReviewBadge, Spinner, Tabs } from '../components/ui';
import { fmtDate, fmtDateTime } from '../lib/format';
import { friendlyError, supabase } from '../lib/supabase';
import type { DocumentAlert, DocumentRow } from '../lib/types';

type Tab = 'vencimientos' | 'revision';
type PendingDoc = DocumentRow & {
  driver: { id: string; first_name: string; last_name: string; code: string } | null;
  motorcycle: { id: string; plate: string } | null;
};

const LEVELS = [
  { id: 'todos', label: 'Todos' },
  { id: 'vencido', label: 'Vencidos' },
  { id: '7', label: '≤ 7 días' },
  { id: '15', label: '≤ 15 días' },
  { id: '30', label: '≤ 30 días' },
];

export default function Documents() {
  const [params, setParams] = useSearchParams();
  const tab = (params.get('tab') as Tab) || 'vencimientos';
  const [level, setLevel] = useState('todos');
  const [alerts, setAlerts] = useState<DocumentAlert[] | null>(null);
  const [pending, setPending] = useState<PendingDoc[] | null>(null);
  const [labels, setLabels] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    const [a, p, t] = await Promise.all([
      supabase.from('document_alerts').select('*').order('expiry_date'),
      supabase
        .from('documents')
        .select('*, driver:drivers(id,first_name,last_name,code), motorcycle:motorcycles(id,plate)')
        .eq('review_status', 'pendiente')
        .order('uploaded_at')
        .limit(300),
      loadDocTypes().catch(() => []),
    ]);
    if (a.error || p.error) return setError(friendlyError(a.error || p.error));
    setAlerts((a.data ?? []) as DocumentAlert[]);
    setPending((p.data ?? []) as PendingDoc[]);
    setLabels(Object.fromEntries(t.map((x) => [x.key, x.label])));
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  if (error) return <ErrorBox message={error} onRetry={load} />;
  if (!alerts || !pending) return <Spinner />;

  const filtered = alerts.filter((a) => {
    if (level === 'todos') return true;
    if (level === 'vencido') return a.days_left < 0;
    return a.days_left >= 0 && a.days_left <= Number(level);
  });

  return (
    <>
      <PageHeader title="Documentos" subtitle="Alertas de vencimiento (30, 15 y 7 días) y documentos pendientes de revisión" />
      <Tabs<Tab>
        value={tab}
        onChange={(t) => setParams({ tab: t }, { replace: true })}
        tabs={[
          { id: 'vencimientos', label: 'Vencimientos', count: alerts.length },
          { id: 'revision', label: 'Por revisar', count: pending.length },
        ]}
      />

      {tab === 'vencimientos' && (
        <>
          <div className="mb-4 flex flex-wrap gap-2">
            {LEVELS.map((l) => (
              <button
                key={l.id}
                onClick={() => setLevel(l.id)}
                className={cx(
                  'rounded-full px-3.5 py-1.5 text-sm ring-1',
                  level === l.id ? 'bg-yummy-500 text-white ring-yummy-400' : 'bg-ink-800 text-gray-300 ring-ink-500',
                )}
              >
                {l.label}
              </button>
            ))}
          </div>
          {filtered.length === 0 ? (
            <EmptyState icon={FileCheck2} title="Sin alertas" text="No hay documentos vencidos ni por vencer en este rango." />
          ) : (
            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
              {filtered.map((a) => (
                <Link key={a.id} to={a.driver_id ? `/conductores/${a.driver_id}?tab=documentos` : `/motocicletas/${a.motorcycle_id}`}>
                  <Card className="p-4 transition hover:border-yummy-600 sm:p-4">
                    <div className="flex items-start gap-3">
                      <FileWarning className={cx('h-5 w-5 shrink-0', a.days_left < 0 ? 'text-red-400' : a.days_left <= 7 ? 'text-orange-400' : 'text-amber-300')} />
                      <div className="text-sm">
                        <p className="font-medium text-white">{a.doc_label}</p>
                        <p className="text-gray-400">{a.driver_name ? `${a.driver_name} (${a.driver_code})` : `Motocicleta ${a.motorcycle_plate}`}</p>
                        <p className={cx('mt-1 text-xs font-semibold', a.days_left < 0 ? 'text-red-300' : a.days_left <= 7 ? 'text-orange-300' : 'text-amber-200')}>
                          {a.days_left < 0 ? `Vencido hace ${-a.days_left} día(s)` : a.days_left === 0 ? 'Vence hoy' : `Vence en ${a.days_left} día(s)`} ·{' '}
                          {fmtDate(a.expiry_date)}
                        </p>
                      </div>
                    </div>
                  </Card>
                </Link>
              ))}
            </div>
          )}
        </>
      )}

      {tab === 'revision' &&
        (pending.length === 0 ? (
          <EmptyState icon={FileCheck2} title="Todo revisado" text="No hay documentos pendientes de revisión." />
        ) : (
          <Card className="p-0 sm:p-0">
            <ul className="divide-y divide-ink-600">
              {pending.map((d) => (
                <li key={d.id}>
                  <Link
                    to={d.driver ? `/conductores/${d.driver.id}?tab=documentos` : `/motocicletas/${d.motorcycle?.id}`}
                    className="flex items-center justify-between gap-3 px-4 py-3 hover:bg-ink-700/40"
                  >
                    <div className="text-sm">
                      <p className="font-medium text-white">{labels[d.doc_type] ?? d.doc_type}</p>
                      <p className="text-xs text-gray-400">
                        {d.driver ? `${d.driver.first_name} ${d.driver.last_name} (${d.driver.code})` : `Moto ${d.motorcycle?.plate}`} · cargado{' '}
                        {fmtDateTime(d.uploaded_at)}
                      </p>
                    </div>
                    <ReviewBadge status={d.review_status} />
                  </Link>
                </li>
              ))}
            </ul>
          </Card>
        ))}
    </>
  );
}
