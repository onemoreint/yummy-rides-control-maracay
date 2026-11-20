import { KeyRound, Plus, ShieldCheck, UserCog } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { useAuth } from '../auth/AuthProvider';
import { Badge, Button, Card, ErrorBox, Field, Input, Modal, PageHeader, Select, Spinner, useConfirm, useToast } from '../components/ui';
import { fmtDateTime } from '../lib/format';
import { friendlyError, supabase } from '../lib/supabase';
import type { AppRole, UserProfile } from '../lib/types';

async function callAdmin(body: Record<string, unknown>) {
  const { data, error } = await supabase.functions.invoke('admin-users', { body });
  if (error) {
    // El cuerpo de la respuesta trae el mensaje en español
    const ctx = (error as { context?: Response }).context;
    if (ctx && typeof ctx.json === 'function') {
      const j = await ctx.json().catch(() => null);
      if (j?.error) throw new Error(j.error);
    }
    throw new Error('No se pudo contactar la función de administración de usuarios. ¿Está desplegada?');
  }
  if (data?.error) throw new Error(data.error);
  return data;
}

export default function UsersPage() {
  const { profile: me } = useAuth();
  const toast = useToast();
  const confirm = useConfirm();
  const [users, setUsers] = useState<UserProfile[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [resetFor, setResetFor] = useState<UserProfile | null>(null);

  const load = useCallback(async () => {
    setError(null);
    const { data, error } = await supabase.from('users_profiles').select('*').order('created_at');
    if (error) return setError(friendlyError(error));
    setUsers((data ?? []) as UserProfile[]);
  }, []);
  useEffect(() => {
    void load();
  }, [load]);

  async function setRole(u: UserProfile, role: AppRole) {
    if (!(await confirm({ title: 'Cambiar rol', message: `¿Asignar a ${u.email} el rol ${role === 'admin' ? 'Administrador principal' : 'Operador administrativo'}?` }))) return;
    const { error } = await supabase.from('users_profiles').update({ role }).eq('id', u.id);
    if (error) return toast('error', friendlyError(error));
    toast('success', 'Rol actualizado.');
    void load();
  }

  async function toggleActive(u: UserProfile) {
    const ok = await confirm({
      title: u.active ? 'Desactivar usuario' : 'Activar usuario',
      message: u.active ? `${u.email} perderá el acceso de inmediato. Su historial se conserva.` : `${u.email} podrá volver a ingresar.`,
      danger: u.active,
      confirmText: u.active ? 'Desactivar' : 'Activar',
    });
    if (!ok) return;
    try {
      await callAdmin({ action: 'set_active', user_id: u.id, active: !u.active });
      toast('success', u.active ? 'Usuario desactivado.' : 'Usuario activado.');
      void load();
    } catch (e) {
      toast('error', friendlyError(e));
    }
  }

  if (error) return <ErrorBox message={error} onRetry={load} />;
  if (!users) return <Spinner />;

  return (
    <>
      <PageHeader
        title="Usuarios administrativos"
        subtitle="No existe registro público: sólo el administrador crea cuentas."
        actions={
          <Button icon={Plus} onClick={() => setCreateOpen(true)}>
            Nuevo usuario
          </Button>
        }
      />
      <div className="grid gap-3 md:grid-cols-2">
        {users.map((u) => (
          <Card key={u.id}>
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="truncate font-medium text-white">{u.full_name || '(sin nombre)'}</p>
                <p className="truncate text-sm text-gray-400">{u.email}</p>
                <p className="mt-1 text-xs text-gray-500">Creado {fmtDateTime(u.created_at)}</p>
              </div>
              <div className="flex flex-col items-end gap-1">
                <Badge className={u.role === 'admin' ? 'bg-yummy-500/20 text-yummy-200 ring-yummy-500/40' : 'bg-sky-500/15 text-sky-300 ring-sky-500/30'}>
                  {u.role === 'admin' ? 'Administrador' : 'Operador'}
                </Badge>
                <Badge className={u.active ? 'bg-emerald-500/15 text-emerald-300 ring-emerald-500/30' : 'bg-red-500/15 text-red-300 ring-red-500/30'}>
                  {u.active ? 'Activo' : 'Inactivo'}
                </Badge>
              </div>
            </div>
            {u.id !== me?.id ? (
              <div className="mt-3 flex flex-wrap gap-2">
                <Button size="sm" variant="secondary" icon={u.role === 'admin' ? UserCog : ShieldCheck} onClick={() => setRole(u, u.role === 'admin' ? 'operator' : 'admin')}>
                  {u.role === 'admin' ? 'Hacer operador' : 'Hacer administrador'}
                </Button>
                <Button size="sm" variant="secondary" icon={KeyRound} onClick={() => setResetFor(u)}>
                  Nueva contraseña
                </Button>
                <Button size="sm" variant={u.active ? 'danger' : 'primary'} onClick={() => toggleActive(u)}>
                  {u.active ? 'Desactivar' : 'Activar'}
                </Button>
              </div>
            ) : (
              <p className="mt-3 text-xs text-gray-500">Esta es su cuenta.</p>
            )}
          </Card>
        ))}
      </div>
      <CreateUserModal
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        onCreated={() => {
          setCreateOpen(false);
          void load();
        }}
      />
      <ResetPasswordModal user={resetFor} onClose={() => setResetFor(null)} />
    </>
  );
}

function CreateUserModal({ open, onClose, onCreated }: { open: boolean; onClose: () => void; onCreated: () => void }) {
  const toast = useToast();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [role, setRole] = useState<AppRole>('operator');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    if (open) {
      setName('');
      setEmail('');
      setPassword('');
      setRole('operator');
      setError(null);
    }
  }, [open]);
  async function save() {
    setError(null);
    if (name.trim().length < 3) return setError('Indique el nombre completo.');
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return setError('Correo inválido.');
    if (password.length < 10) return setError('La contraseña debe tener al menos 10 caracteres.');
    setBusy(true);
    try {
      await callAdmin({ action: 'create', full_name: name.trim(), email: email.trim(), password, role });
      toast('success', 'Usuario creado. Entréguele la contraseña por un canal seguro.');
      onCreated();
    } catch (e) {
      setError(friendlyError(e));
    } finally {
      setBusy(false);
    }
  }
  return (
    <Modal open={open} onClose={onClose} title="Nuevo usuario administrativo">
      <div className="space-y-4">
        {error && <ErrorBox message={error} />}
        <Field label="Nombre completo" required>
          <Input value={name} onChange={(e) => setName(e.target.value)} />
        </Field>
        <Field label="Correo electrónico" required>
          <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="off" />
        </Field>
        <Field label="Contraseña temporal" required hint="Mínimo 10 caracteres">
          <Input type="text" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="new-password" />
        </Field>
        <Field label="Rol" required>
          <Select value={role} onChange={(e) => setRole(e.target.value as AppRole)}>
            <option value="operator">Operador administrativo</option>
            <option value="admin">Administrador principal</option>
          </Select>
        </Field>
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose}>
            Cancelar
          </Button>
          <Button loading={busy} onClick={save}>
            Crear usuario
          </Button>
        </div>
      </div>
    </Modal>
  );
}

function ResetPasswordModal({ user, onClose }: { user: UserProfile | null; onClose: () => void }) {
  const toast = useToast();
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  useEffect(() => setPassword(''), [user]);
  async function save() {
    if (!user) return;
    if (password.length < 10) return toast('error', 'Mínimo 10 caracteres.');
    setBusy(true);
    try {
      await callAdmin({ action: 'reset_password', user_id: user.id, password });
      toast('success', 'Contraseña actualizada.');
      onClose();
    } catch (e) {
      toast('error', friendlyError(e));
    } finally {
      setBusy(false);
    }
  }
  return (
    <Modal open={!!user} onClose={onClose} title={`Nueva contraseña para ${user?.email ?? ''}`}>
      <Field label="Nueva contraseña" hint="Mínimo 10 caracteres">
        <Input type="text" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="new-password" />
      </Field>
      <div className="mt-4 flex justify-end gap-2">
        <Button variant="secondary" onClick={onClose}>
          Cancelar
        </Button>
        <Button loading={busy} onClick={save}>
          Guardar
        </Button>
      </div>
    </Modal>
  );
}
