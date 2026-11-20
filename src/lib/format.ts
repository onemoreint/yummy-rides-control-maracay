import type { AffiliationStatus, Driver, ReviewStatus } from './types';

export const STATUS_LABEL: Record<AffiliationStatus, string> = {
  activo: 'Activo',
  pendiente: 'Pendiente',
  suspendido: 'Suspendido',
  retirado: 'Retirado',
};

export const REVIEW_LABEL: Record<ReviewStatus, string> = {
  pendiente: 'Pendiente',
  aprobado: 'Aprobado',
  observado: 'Observado',
};

export function fullName(d: Pick<Driver, 'first_name' | 'middle_name' | 'last_name' | 'second_last_name'>) {
  return [d.first_name, d.middle_name, d.last_name, d.second_last_name].filter(Boolean).join(' ');
}

export function shortName(d: Pick<Driver, 'first_name' | 'last_name'>) {
  return `${d.first_name} ${d.last_name}`;
}

export function cedula(d: Pick<Driver, 'id_prefix' | 'id_number'>) {
  const n = d.id_number.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  return `${d.id_prefix}-${n}`;
}

/** Fecha 'YYYY-MM-DD' → '20/11/2026' sin desfase de zona horaria. */
export function fmtDate(v: string | null | undefined) {
  if (!v) return '—';
  const [y, m, d] = v.slice(0, 10).split('-');
  return `${d}/${m}/${y}`;
}

export function fmtDateTime(v: string | null | undefined) {
  if (!v) return '—';
  return new Date(v).toLocaleString('es-VE', { dateStyle: 'short', timeStyle: 'short' });
}

export function todayISO() {
  const d = new Date();
  const off = d.getTimezoneOffset();
  return new Date(d.getTime() - off * 60000).toISOString().slice(0, 10);
}

/** Muestra un teléfono guardado como dígitos (+58 414 123 4567 o 0414-1234567). */
export function fmtPhone(v: string | null | undefined) {
  if (!v) return '—';
  if (v.startsWith('+58') && v.length === 13) return `+58 ${v.slice(3, 6)} ${v.slice(6, 9)} ${v.slice(9)}`;
  if (v.startsWith('0') && v.length === 11) return `${v.slice(0, 4)}-${v.slice(4)}`;
  return v;
}

/** Enlace wa.me: convierte 0414… venezolano en 58414… */
export function whatsappLink(v: string | null | undefined) {
  if (!v) return null;
  let n = v.replace(/[^0-9]/g, '');
  if (n.startsWith('0')) n = '58' + n.slice(1);
  return `https://wa.me/${n}`;
}

export function fmtBytes(n: number) {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}

export function daysUntil(dateISO: string) {
  const [y, m, d] = dateISO.split('-').map(Number);
  const target = Date.UTC(y, m - 1, d);
  const t = todayISO().split('-').map(Number);
  const now = Date.UTC(t[0], t[1] - 1, t[2]);
  return Math.round((target - now) / 86400000);
}

/** Escapa comodines para búsquedas ilike/like en PostgREST. */
export function searchTerm(q: string) {
  return q
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[%_,()*\\]/g, ' ')
    .replace(/\s+/g, ' ');
}
