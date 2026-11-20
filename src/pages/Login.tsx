import { Eye, EyeOff, Lock, LogIn, Mail } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { useAuth } from '../auth/AuthProvider';
import { Logo } from '../components/Layout';
import { Button, ErrorBox } from '../components/ui';

export default function Login() {
  const { signIn } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [show, setShow] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (!email || !password) return setError('Ingrese su correo y contraseña.');
    setBusy(true);
    const err = await signIn(email, password);
    setBusy(false);
    if (err) setError(err);
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-ink-900 bg-[radial-gradient(circle_at_50%_0%,rgba(160,32,240,0.35),transparent_60%)] px-4 py-10">
      <div className="w-full max-w-sm animate-fadein">
        <div className="mb-8 flex flex-col items-center text-center">
          <Logo size={120} />
          <h1 className="mt-5 text-2xl font-bold text-white">Yummy Rides Control</h1>
          <p className="text-sm text-yummy-300">Maracay · Acceso administrativo</p>
        </div>
        <form onSubmit={submit} className="space-y-4 rounded-2xl border border-ink-600 bg-ink-800/90 p-6 shadow-glow" noValidate>
          {error && <ErrorBox message={error} />}
          <label className="block">
            <span className="mb-1.5 block text-sm font-medium text-gray-200">Correo electrónico</span>
            <div className="relative">
              <Mail className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-500" />
              <input
                type="email"
                autoComplete="username"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full rounded-xl border border-ink-500 bg-ink-900 py-2.5 pl-10 pr-3 text-sm text-white focus:border-yummy-400 focus:outline-none focus:ring-2 focus:ring-yummy-500/40"
                placeholder="usuario@correo.com"
              />
            </div>
          </label>
          <label className="block">
            <span className="mb-1.5 block text-sm font-medium text-gray-200">Contraseña</span>
            <div className="relative">
              <Lock className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-500" />
              <input
                type={show ? 'text' : 'password'}
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full rounded-xl border border-ink-500 bg-ink-900 py-2.5 pl-10 pr-10 text-sm text-white focus:border-yummy-400 focus:outline-none focus:ring-2 focus:ring-yummy-500/40"
              />
              <button
                type="button"
                onClick={() => setShow((s) => !s)}
                className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 text-gray-400 hover:text-white"
                aria-label={show ? 'Ocultar contraseña' : 'Mostrar contraseña'}
              >
                {show ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
          </label>
          <Button type="submit" loading={busy} icon={LogIn} className="w-full">
            Ingresar
          </Button>
          <p className="text-center text-xs text-gray-500">
            Sistema privado. Las cuentas las crea el administrador principal.
          </p>
        </form>
      </div>
    </div>
  );
}
