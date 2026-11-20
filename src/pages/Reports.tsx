import { FileSpreadsheet, FileText, Lock, Play, Table2 } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { loadDocTypes } from '../components/DocumentsPanel';
import { Button, Card, cx, EmptyState, ErrorBox, Field, Input, PageHeader, Select, Spinner, useToast } from '../components/ui';
import { logEvent } from '../lib/audit';
import { exportCSV, exportReportPDF, exportXLSX, type ExportColumn, type ExportRow } from '../lib/exporters';
import { cedula, fmtDate, fmtPhone, fullName, REVIEW_LABEL, STATUS_LABEL, todayISO } from '../lib/format';
import { friendlyError, supabase } from '../lib/supabase';
import type { CurrentMoto, DocumentAlert, Driver, Motorcycle } from '../lib/types';

type ReportId = 'activo' | 'suspendido' | 'pendiente' | 'retirado' | 'ingresos' | 'motos' | 'vencidos' | 'por_vencer';

const REPORTS: { id: ReportId; label: string }[] = [
  { id: 'activo', label: 'Conductores activos' },
  { id: 'suspendido', label: 'Conductores suspendidos' },
  { id: 'pendiente', label: 'Conductores pendientes' },
  { id: 'retirado', label: 'Conductores retirados' },
  { id: 'ingresos', label: 'Conductores ingresados por rango de fechas' },
  { id: 'motos', label: 'Motocicletas registradas' },
  { id: 'vencidos', label: 'Documentos vencidos' },
  { id: 'por_vencer', label: 'Documentos próximos a vencer (30 días)' },
];

interface Col extends ExportColumn {
  personal?: boolean; // dato personal: desmarcado por defecto (minimización de datos)
  def?: boolean;
}

const DRIVER_COLS: Col[] = [
  { key: 'code', label: 'Código', def: true },
  { key: 'name', label: 'Nombre completo', def: true },
  { key: 'cedula', label: 'Cédula', personal: true },
  { key: 'status', label: 'Estado', def: true },
  { key: 'join_date', label: 'Fecha de ingreso', def: true },
  { key: 'moto', label: 'Moto actual (placa)', def: true },
  { key: 'municipality', label: 'Municipio', def: true },
  { key: 'parish', label: 'Parroquia' },
  { key: 'phone', label: 'Teléfono', personal: true },
  { key: 'whatsapp', label: 'WhatsApp', personal: true },
  { key: 'address', label: 'Dirección', personal: true },
  { key: 'birth_date', label: 'Fecha de nacimiento', personal: true },
  { key: 'emergency', label: 'Contacto de emergencia', personal: true },
  { key: 'notes', label: 'Observaciones internas', personal: true },
];
const MOTO_COLS: Col[] = [
  { key: 'code', label: 'Código', def: true },
  { key: 'plate', label: 'Placa', def: true },
  { key: 'brand', label: 'Marca', def: true },
  { key: 'model', label: 'Modelo', def: true },
  { key: 'year', label: 'Año', def: true },
  { key: 'color', label: 'Color', def: true },
  { key: 'displacement', label: 'Cilindrada' },
  { key: 'driver', label: 'Conductor actual', def: true },
  { key: 'owner', label: 'Propietario', personal: true },
  { key: 'owner_doc', label: 'Doc. propietario', personal: true },
  { key: 'chassis', label: 'Serial chasis' },
  { key: 'engine', label: 'Serial motor' },
];
const DOC_COLS: Col[] = [
  { key: 'doc', label: 'Documento', def: true },
  { key: 'owner', label: 'Conductor / Moto', def: true },
  { key: 'code', label: 'Código', def: true },
  { key: 'expiry', label: 'Vencimiento', def: true },
  { key: 'days', label: 'Días', def: true },
  { key: 'review', label: 'Revisión', def: true },
];

async function fetchAll<T>(build: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: unknown }>): Promise<T[]> {
  const out: T[] = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await build(from, from + 999);
    if (error) throw error;
    out.push(...(data ?? []));
    if (!data || data.length < 1000) break;
  }
  return out;
}

export default function Reports() {
  const toast = useToast();
  const [report, setReport] = useState<ReportId>('activo');
  const [from, setFrom] = useState(`${new Date().getFullYear()}-01-01`);
  const [to, setTo] = useState(todayISO());
  const [rows, setRows] = useState<ExportRow[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [exporting, setExporting] = useState<string | null>(null);

  const cols = useMemo(() => (report === 'motos' ? MOTO_COLS : report === 'vencidos' || report === 'por_vencer' ? DOC_COLS : DRIVER_COLS), [report]);
  const [selected, setSelected] = useState<string[]>(DRIVER_COLS.filter((c) => c.def).map((c) => c.key));
  useEffect(() => {
    setSelected(cols.filter((c) => c.def).map((c) => c.key));
    setRows(null);
  }, [cols]);
  useEffect(() => setRows(null), [report, from, to]);

  async function run() {
    setBusy(true);
    setError(null);
    try {
      if (report === 'motos') {
        const motos = await fetchAll<Motorcycle>((a, b) => supabase.from('motorcycles').select('*').order('plate').range(a, b));
        const cur = await fetchAll<CurrentMoto & { driver_id: string }>((a, b) => supabase.from('driver_current_motorcycle').select('*').range(a, b));
        const drvIds = cur.map((c) => c.driver_id);
        const drivers = drvIds.length ? ((await supabase.from('drivers').select('id,first_name,last_name').in('id', drvIds)).data ?? []) : [];
        const dName = Object.fromEntries(drivers.map((d) => [d.id, `${d.first_name} ${d.last_name}`]));
        const byMoto = Object.fromEntries(cur.map((c) => [c.motorcycle_id, dName[c.driver_id]]));
        setRows(
          motos.map((m) => ({
            code: m.code,
            plate: m.plate,
            brand: m.brand,
            model: m.model,
            year: m.year ?? '',
            color: m.color ?? '',
            displacement: m.displacement_cc ?? '',
            driver: byMoto[m.id] ?? '',
            owner: m.owner_name,
            owner_doc: m.owner_id_doc ?? '',
            chassis: m.chassis_serial ?? '',
            engine: m.engine_serial ?? '',
          })),
        );
      } else if (report === 'vencidos' || report === 'por_vencer') {
        const [alerts, types] = await Promise.all([
          fetchAll<DocumentAlert>((a, b) => supabase.from('document_alerts').select('*').order('expiry_date').range(a, b)),
          loadDocTypes(),
        ]);
        const label = Object.fromEntries(types.map((t) => [t.key, t.label]));
        const list = alerts.filter((x) => (report === 'vencidos' ? x.days_left < 0 : x.days_left >= 0));
        const reviews = list.length
          ? ((await supabase.from('documents').select('id,review_status').in('id', list.map((x) => x.id))).data ?? [])
          : [];
        const rv = Object.fromEntries(reviews.map((r) => [r.id, REVIEW_LABEL[r.review_status as keyof typeof REVIEW_LABEL]]));
        setRows(
          list.map((x) => ({
            doc: label[x.doc_type] ?? x.doc_type,
            owner: x.driver_name ?? `Moto ${x.motorcycle_plate}`,
            code: x.driver_code ?? x.motorcycle_plate ?? '',
            expiry: fmtDate(x.expiry_date),
            days: x.days_left,
            review: rv[x.id] ?? '',
          })),
        );
      } else {
        const list = await fetchAll<Driver>((a, b) => {
          let q = supabase.from('drivers').select('*').eq('is_draft', false);
          if (report === 'ingresos') q = q.gte('join_date', from).lte('join_date', to);
          else q = q.eq('status', report);
          return q.order('join_date').range(a, b);
        });
        const cur = await fetchAll<CurrentMoto>((a, b) => supabase.from('driver_current_motorcycle').select('*').range(a, b));
        const moto = Object.fromEntries(cur.map((c) => [c.driver_id, c.plate]));
        setRows(
          list.map((d) => ({
            code: d.code,
            name: fullName(d),
            cedula: cedula(d),
            status: STATUS_LABEL[d.status],
            join_date: fmtDate(d.join_date),
            moto: moto[d.id] ?? '',
            municipality: d.municipality ?? '',
            parish: d.parish ?? '',
            phone: fmtPhone(d.phone),
            whatsapp: fmtPhone(d.whatsapp),
            address: d.address ?? '',
            birth_date: fmtDate(d.birth_date),
            emergency: d.emergency_name ? `${d.emergency_name} (${d.emergency_relationship ?? ''}) ${fmtPhone(d.emergency_phone)}` : '',
            notes: d.internal_notes ?? '',
          })),
        );
      }
    } catch (e) {
      setError(friendlyError(e));
    } finally {
      setBusy(false);
    }
  }

  const activeCols = cols.filter((c) => selected.includes(c.key));
  const title = REPORTS.find((r) => r.id === report)!.label;
  const subtitle = report === 'ingresos' ? `Desde ${fmtDate(from)} hasta ${fmtDate(to)} · ${rows?.length ?? 0} registro(s)` : `${rows?.length ?? 0} registro(s)`;

  async function doExport(kind: 'xlsx' | 'pdf' | 'csv') {
    if (!rows?.length) return;
    if (!activeCols.length) return toast('error', 'Seleccione al menos una columna.');
    setExporting(kind);
    try {
      if (kind === 'csv') exportCSV(title, activeCols, rows);
      if (kind === 'xlsx') await exportXLSX(title, activeCols, rows);
      if (kind === 'pdf') await exportReportPDF(title, subtitle, activeCols, rows);
      void logEvent('EXPORT', `${title} (${kind.toUpperCase()}, ${rows.length} filas, columnas: ${activeCols.map((c) => c.label).join(', ')})`);
    } catch (e) {
      toast('error', friendlyError(e));
    } finally {
      setExporting(null);
    }
  }

  return (
    <>
      <PageHeader title="Reportes administrativos" subtitle="Datos reales de la base de datos. Elija sólo las columnas necesarias." />
      <div className="grid gap-4 lg:grid-cols-[340px,1fr]">
        <Card className="h-fit space-y-4">
          <Field label="Reporte">
            <Select value={report} onChange={(e) => setReport(e.target.value as ReportId)}>
              {REPORTS.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.label}
                </option>
              ))}
            </Select>
          </Field>
          {report === 'ingresos' && (
            <div className="grid grid-cols-2 gap-3">
              <Field label="Desde">
                <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
              </Field>
              <Field label="Hasta">
                <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} />
              </Field>
            </div>
          )}
          <fieldset>
            <legend className="mb-2 text-sm font-medium text-gray-200">Columnas</legend>
            <div className="space-y-1.5">
              {cols.map((c) => (
                <label key={c.key} className="flex items-center gap-2 text-sm text-gray-300">
                  <input
                    type="checkbox"
                    className="h-4 w-4 accent-yummy-500"
                    checked={selected.includes(c.key)}
                    onChange={(e) => setSelected((s) => (e.target.checked ? [...s, c.key] : s.filter((k) => k !== c.key)))}
                  />
                  {c.label}
                  {c.personal && (
                    <span className="inline-flex items-center gap-0.5 text-[10px] uppercase text-amber-300" title="Dato personal">
                      <Lock className="h-3 w-3" /> personal
                    </span>
                  )}
                </label>
              ))}
            </div>
            <p className="mt-2 text-xs text-gray-500">Los datos personales vienen desmarcados. Inclúyalos sólo si el reporte lo requiere.</p>
          </fieldset>
          <Button icon={Play} loading={busy} onClick={run} className="w-full">
            Generar reporte
          </Button>
        </Card>

        <div>
          {error ? (
            <ErrorBox message={error} onRetry={run} />
          ) : busy ? (
            <Spinner label="Consultando datos…" />
          ) : !rows ? (
            <EmptyState icon={Table2} title="Configure y genere el reporte" text="La vista previa aparecerá aquí." />
          ) : (
            <Card>
              <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                <div>
                  <h2 className="font-semibold text-white">{title}</h2>
                  <p className="text-xs text-gray-400">{subtitle}</p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button size="sm" variant="secondary" icon={FileSpreadsheet} loading={exporting === 'xlsx'} disabled={!rows.length} onClick={() => doExport('xlsx')}>
                    Excel
                  </Button>
                  <Button size="sm" variant="secondary" icon={FileText} loading={exporting === 'pdf'} disabled={!rows.length} onClick={() => doExport('pdf')}>
                    PDF
                  </Button>
                  <Button size="sm" variant="secondary" loading={exporting === 'csv'} disabled={!rows.length} onClick={() => doExport('csv')}>
                    CSV
                  </Button>
                </div>
              </div>
              {rows.length === 0 ? (
                <p className="py-8 text-center text-sm text-gray-500">El reporte no tiene registros.</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs">
                    <thead className="text-gray-400">
                      <tr>
                        {activeCols.map((c) => (
                          <th key={c.key} className="whitespace-nowrap border-b border-ink-600 px-2 py-2">
                            {c.label}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {rows.slice(0, 50).map((r, i) => (
                        <tr key={i} className={cx(i % 2 === 1 && 'bg-ink-900/40')}>
                          {activeCols.map((c) => (
                            <td key={c.key} className="whitespace-nowrap px-2 py-1.5 text-gray-200">
                              {r[c.key] ?? ''}
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {rows.length > 50 && <p className="mt-2 text-xs text-gray-500">Vista previa de 50 filas. La exportación incluye las {rows.length}.</p>}
                </div>
              )}
            </Card>
          )}
        </div>
      </div>
    </>
  );
}
