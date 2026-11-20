import {
  AlertTriangle,
  Bike,
  CheckCircle2,
  Clock,
  FileClock,
  FileWarning,
  PauseCircle,
  Plus,
  Search,
  UserMinus,
  Users,
  type LucideIcon,
} from 'lucide-react';
import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { SignedImage } from '../components/media';
import { Button, Card, cx, EmptyState, ErrorBox, PageHeader, Spinner, StatusBadge } from '../components/ui';
import { cedula, fmtDate, fmtDateTime, shortName } from '../lib/format';
import { friendlyError, supabase } from '../lib/supabase';
import type { AuditLog, DashboardStats, Driver, DocumentAlert } from '../lib/types';

function Stat({
  label,
  value,
  icon: Icon,
  tone,
  to,
}: {
  label: string;
  value: number;
  icon: LucideIcon;
  tone: string;
  to?: string;
}) {
  const body = (
    <div className="group flex items-center gap-3 rounded-2xl border border-ink-600 bg-ink-800/80 p-4 transition hover:border-yummy-600 hover:shadow-glow">
      <div className={cx('rounded-xl p-2.5 ring-1', tone)}>
        <Icon className="h-5 w-5" />
      </div>
      <div className="min-w-0">
        <p className="text-2xl font-bold tabular-nums text-white">{value}</p>
        <p className="truncate text-xs text-gray-400">{label}</p>
      </div>
    </div>
  );
  return to ? <Link to={to}>{body}</Link> : body;
}

export default function Dashboard() {
  const nav = useNavigate();
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [recent, setRecent] = useState<Driver[]>([]);
  const [activity, setActivity] = useState<AuditLog[]>([]);
  const [alerts, setAlerts] = useState<DocumentAlert[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [q, setQ] = useState('');

  const load = useCallback(async () => {
    setError(null);
    const [s, d, a, al] = await Promise.all([
      supabase.rpc('dashboard_stats'),
      supabase.from('drivers').select('*').order('created_at', { ascending: false }).limit(8),
      supabase
        .from('audit_logs')
        .select('id,actor_email,action,summary,driver_id,created_at,table_name')
        .neq('table_name', 'app')
        .order('created_at', { ascending: false })
        .limit(10),
      supabase.from('document_alerts').select('*').order('expiry_date').limit(8),
    ]);
    const err = s.error || d.error || a.error || al.error;
    if (err) return setError(friendlyError(err));
    setStats(s.data as DashboardStats);
    setRecent((d.data ?? []) as Driver[]);
    setActivity((a.data ?? []) as AuditLog[]);
    setAlerts((al.data ?? []) as DocumentAlert[]);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  function search(e: FormEvent) {
    e.preventDefault();
    if (q.trim()) nav(`/conductores?q=${encodeURIComponent(q.trim())}`);
  }

  if (error) return <ErrorBox message={error} onRetry={load} />;
  if (!stats) return <Spinner />;

  return (
    <>
      <PageHeader
        title="Panel administrativo"
        subtitle="Resumen en tiempo real de la línea Yummy Rides Maracay"
        actions={
          <>
            <Button icon={Plus} onClick={() => nav('/conductores/nuevo')}>
              Registrar conductor
            </Button>
            <Button variant="secondary" icon={Bike} onClick={() => nav('/motocicletas?nueva=1')}>
              Registrar motocicleta
            </Button>
          </>
        }
      />

      <form onSubmit={search} className="relative mb-6">
        <Search className="pointer-events-none absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-gray-500" />
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Buscar conductor por nombre, cédula o código…"
          className="w-full rounded-2xl border border-ink-500 bg-ink-800 py-3.5 pl-12 pr-4 text-sm text-white placeholder:text-gray-500 focus:border-yummy-400 focus:outline-none focus:ring-2 focus:ring-yummy-500/40"
          aria-label="Buscador general"
        />
      </form>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Stat label="Conductores registrados" value={stats.drivers_total} icon={Users} tone="bg-yummy-500/15 text-yummy-200 ring-yummy-500/40" to="/conductores" />
        <Stat label="Activos" value={stats.drivers_activo} icon={CheckCircle2} tone="bg-emerald-500/15 text-emerald-300 ring-emerald-500/30" to="/conductores?estado=activo" />
        <Stat label="Pendientes" value={stats.drivers_pendiente} icon={Clock} tone="bg-amber-500/15 text-amber-300 ring-amber-500/30" to="/conductores?estado=pendiente" />
        <Stat label="Suspendidos" value={stats.drivers_suspendido} icon={PauseCircle} tone="bg-red-500/15 text-red-300 ring-red-500/30" to="/conductores?estado=suspendido" />
        <Stat label="Retirados" value={stats.drivers_retirado} icon={UserMinus} tone="bg-gray-500/20 text-gray-300 ring-gray-500/30" to="/conductores?estado=retirado" />
        <Stat label="Motocicletas" value={stats.motorcycles_total} icon={Bike} tone="bg-yummy-500/15 text-yummy-200 ring-yummy-500/40" to="/motocicletas" />
        <Stat label="Documentos por revisar" value={stats.docs_pending_review} icon={FileClock} tone="bg-sky-500/15 text-sky-300 ring-sky-500/30" to="/documentos?tab=revision" />
        <Stat label="Por vencer (30 días)" value={stats.docs_expiring_30} icon={FileWarning} tone="bg-orange-500/15 text-orange-300 ring-orange-500/30" to="/documentos" />
      </div>

      {(stats.drivers_borrador > 0 || stats.docs_expired > 0) && (
        <div className="mt-4 flex flex-wrap gap-2 text-sm">
          {stats.drivers_borrador > 0 && (
            <Link to="/conductores?estado=borrador" className="rounded-xl bg-sky-500/10 px-3 py-2 text-sky-200 ring-1 ring-sky-500/30">
              {stats.drivers_borrador} registro(s) en borrador por completar
            </Link>
          )}
          {stats.docs_expired > 0 && (
            <Link to="/documentos" className="rounded-xl bg-red-500/10 px-3 py-2 text-red-200 ring-1 ring-red-500/30">
              {stats.docs_expired} documento(s) vencido(s)
            </Link>
          )}
        </div>
      )}

      <div className="mt-6 grid gap-4 xl:grid-cols-3">
        <Card className="xl:col-span-2">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="font-semibold text-white">Conductores recientes</h2>
            <Link to="/conductores" className="text-sm text-yummy-300 hover:underline">
              Ver todos
            </Link>
          </div>
          {recent.length === 0 ? (
            <EmptyState
              icon={Users}
              title="Aún no hay conductores"
              text="Registre el primer conductor de la línea."
              action={<Button icon={Plus} onClick={() => nav('/conductores/nuevo')}>Registrar conductor</Button>}
            />
          ) : (
            <ul className="divide-y divide-ink-600">
              {recent.map((d) => (
                <li key={d.id}>
                  <Link to={`/conductores/${d.id}`} className="flex items-center gap-3 py-2.5 hover:bg-ink-700/40">
                    <SignedImage path={d.photo_path} alt={shortName(d)} className="h-10 w-10 shrink-0 rounded-full" />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium text-white">{shortName(d)}</p>
                      <p className="text-xs text-gray-400">
                        {d.code} · {cedula(d)} · Ingreso {fmtDate(d.join_date)}
                      </p>
                    </div>
                    <StatusBadge status={d.status} draft={d.is_draft} />
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card>
          <h2 className="mb-3 flex items-center gap-2 font-semibold text-white">
            <AlertTriangle className="h-4 w-4 text-orange-300" /> Vencimientos
          </h2>
          {alerts.length === 0 ? (
            <p className="py-6 text-center text-sm text-gray-500">Sin documentos por vencer en los próximos 30 días.</p>
          ) : (
            <ul className="space-y-2">
              {alerts.map((a) => (
                <li key={a.id}>
                  <Link
                    to={a.driver_id ? `/conductores/${a.driver_id}?tab=documentos` : `/motocicletas/${a.motorcycle_id}`}
                    className="block rounded-xl bg-ink-900/60 p-3 text-sm ring-1 ring-ink-600 hover:ring-yummy-600"
                  >
                    <p className="font-medium text-white">{a.doc_label}</p>
                    <p className="text-xs text-gray-400">{a.driver_name ?? `Moto ${a.motorcycle_plate}`}</p>
                    <p className={cx('mt-1 text-xs font-medium', a.days_left < 0 ? 'text-red-300' : a.days_left <= 7 ? 'text-orange-300' : 'text-amber-200')}>
                      {a.days_left < 0 ? `Vencido hace ${-a.days_left} día(s)` : a.days_left === 0 ? 'Vence hoy' : `Vence en ${a.days_left} día(s)`} ·{' '}
                      {fmtDate(a.expiry_date)}
                    </p>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>

      <Card className="mt-4">
        <h2 className="mb-3 font-semibold text-white">Actividad administrativa reciente</h2>
        {activity.length === 0 ? (
          <p className="py-6 text-center text-sm text-gray-500">Todavía no hay actividad registrada.</p>
        ) : (
          <ul className="divide-y divide-ink-600 text-sm">
            {activity.map((a) => (
              <li key={a.id} className="flex flex-col gap-0.5 py-2 sm:flex-row sm:items-center sm:justify-between">
                <span className="text-gray-200">
                  {a.driver_id ? (
                    <Link to={`/conductores/${a.driver_id}`} className="hover:text-yummy-200">
                      {a.summary}
                    </Link>
                  ) : (
                    a.summary
                  )}
                </span>
                <span className="text-xs text-gray-500">
                  {a.actor_email ?? 'sistema'} · {fmtDateTime(a.created_at)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </>
  );
}
