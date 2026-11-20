import { supabase } from './supabase';

type ClientAction = 'LOGIN' | 'LOGOUT' | 'EXPORT' | 'PRINT' | 'DOWNLOAD' | 'VIEW_DOCUMENT';

/** Registra en auditoría eventos que ocurren en el cliente (descargas, exportes, accesos). */
export async function logEvent(action: ClientAction, summary: string, driverId?: string | null) {
  try {
    await supabase.rpc('log_event', { p_action: action, p_summary: summary, p_driver_id: driverId ?? null });
  } catch {
    /* la auditoría de eventos del cliente nunca debe bloquear la operación */
  }
}
