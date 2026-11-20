// Edge Function: admin-users
// Crea y administra usuarios administrativos. Sólo la puede ejecutar un
// administrador activo. La clave service_role vive únicamente en el servidor
// de Supabase (variable automática SUPABASE_SERVICE_ROLE_KEY), nunca en el frontend.
//
// Despliegue:  supabase functions deploy admin-users
import { createClient } from 'npm:@supabase/supabase-js@2';

const ALLOWED_ORIGINS = (Deno.env.get('ALLOWED_ORIGINS') ?? '*').split(',').map((s) => s.trim());

function cors(origin: string | null) {
  const allow = ALLOWED_ORIGINS.includes('*') || (origin && ALLOWED_ORIGINS.includes(origin)) ? origin ?? '*' : '';
  return {
    'Access-Control-Allow-Origin': allow,
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    Vary: 'Origin',
  };
}

function json(body: unknown, status: number, origin: string | null) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...cors(origin), 'Content-Type': 'application/json' },
  });
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

Deno.serve(async (req) => {
  const origin = req.headers.get('origin');
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors(origin) });
  if (req.method !== 'POST') return json({ error: 'Método no permitido' }, 405, origin);

  const url = Deno.env.get('SUPABASE_URL')!;
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!;
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const authHeader = req.headers.get('Authorization') ?? '';

  // 1) Verificar que quien llama es un administrador activo
  const asCaller = createClient(url, anonKey, { global: { headers: { Authorization: authHeader } } });
  const { data: userData, error: userErr } = await asCaller.auth.getUser();
  if (userErr || !userData.user) return json({ error: 'Sesión no válida' }, 401, origin);
  const { data: isAdmin } = await asCaller.rpc('is_admin');
  if (!isAdmin) return json({ error: 'Sólo un administrador puede gestionar usuarios' }, 403, origin);

  const admin = createClient(url, serviceKey, { auth: { persistSession: false } });

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return json({ error: 'Solicitud inválida' }, 400, origin);
  }
  const action = String(body.action ?? '');

  try {
    if (action === 'create') {
      const email = String(body.email ?? '').trim().toLowerCase();
      const password = String(body.password ?? '');
      const fullName = String(body.full_name ?? '').trim();
      const role = body.role === 'admin' ? 'admin' : 'operator';
      if (!EMAIL_RE.test(email)) return json({ error: 'Correo inválido' }, 400, origin);
      if (password.length < 10) return json({ error: 'La contraseña debe tener al menos 10 caracteres' }, 400, origin);
      if (fullName.length < 3) return json({ error: 'Indique el nombre completo' }, 400, origin);

      const { data, error } = await admin.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
        app_metadata: { role, active: true, full_name: fullName },
      });
      if (error) {
        const msg = /already|registered|exists/i.test(error.message) ? 'Ya existe un usuario con ese correo' : error.message;
        return json({ error: msg }, 400, origin);
      }
      return json({ ok: true, id: data.user?.id }, 200, origin);
    }

    if (action === 'reset_password') {
      const id = String(body.user_id ?? '');
      const password = String(body.password ?? '');
      if (password.length < 10) return json({ error: 'La contraseña debe tener al menos 10 caracteres' }, 400, origin);
      const { error } = await admin.auth.admin.updateUserById(id, { password });
      if (error) return json({ error: error.message }, 400, origin);
      await admin.from('audit_logs').insert({
        actor_id: userData.user.id,
        actor_email: userData.user.email,
        action: 'RESET_PASSWORD',
        table_name: 'users_profiles',
        record_id: id,
        summary: 'Restablecimiento de contraseña',
      });
      return json({ ok: true }, 200, origin);
    }

    if (action === 'set_active') {
      const id = String(body.user_id ?? '');
      const active = body.active === true;
      if (id === userData.user.id) return json({ error: 'No puede desactivarse a sí mismo' }, 400, origin);
      // Se usa el cliente del llamante para que apliquen RLS y las reglas del trigger
      const { error } = await asCaller.from('users_profiles').update({ active }).eq('id', id);
      if (error) return json({ error: error.message }, 400, origin);
      // Bloquear o desbloquear también en Auth (cierra el acceso inmediatamente)
      await admin.auth.admin.updateUserById(id, { ban_duration: active ? 'none' : '876000h' });
      return json({ ok: true }, 200, origin);
    }

    return json({ error: 'Acción desconocida' }, 400, origin);
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : 'Error inesperado' }, 500, origin);
  }
});
