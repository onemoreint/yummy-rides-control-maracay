import { createClient, type SupabaseClient } from '@supabase/supabase-js';

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const key = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

export const isConfigured = Boolean(url && key && !url.includes('xxxxxxxx'));

// Si no hay credenciales la app muestra la pantalla de configuración:
// nunca simula persistencia.
export const supabase: SupabaseClient = createClient(url || 'http://localhost', key || 'missing', {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: false,
    storageKey: 'yummy-control-auth',
  },
});

export const BUCKET = 'yummy-private';

/** Traduce errores de Postgres/Supabase a mensajes claros en español. */
export function friendlyError(err: unknown): string {
  if (!err) return 'Error desconocido';
  const e = err as { message?: string; code?: string; details?: string };
  const msg = e.message ?? String(err);
  if (e.code === '23505' || /duplicate key/i.test(msg)) {
    if (/cedula/i.test(msg)) return 'Ya existe un conductor registrado con esa cédula.';
    if (/plate/i.test(msg)) return 'Ya existe una motocicleta registrada con esa placa.';
    if (/chassis/i.test(msg)) return 'Ya existe una motocicleta con ese serial de chasis.';
    if (/one_current/i.test(msg)) return 'Ese conductor o motocicleta ya tiene una asignación vigente.';
    return 'El registro ya existe (dato duplicado).';
  }
  if (e.code === '42501' || /row-level security|permission denied/i.test(msg))
    return /sólo|No tiene|No puede|estado de afiliación/i.test(msg) ? msg : 'No tiene permisos para realizar esta acción.';
  if (/Failed to fetch|NetworkError/i.test(msg)) return 'Sin conexión con el servidor. Verifique su internet e intente de nuevo.';
  if (/Invalid login credentials/i.test(msg)) return 'Correo o contraseña incorrectos.';
  if (/JWT expired/i.test(msg)) return 'Su sesión expiró. Inicie sesión nuevamente.';
  if (/violates check constraint/i.test(msg)) return 'Algún dato no tiene el formato válido. Revise el formulario.';
  return msg;
}
