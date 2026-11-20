import {
  Bike,
  ClipboardList,
  FileText,
  LayoutDashboard,
  LogOut,
  Menu,
  Settings,
  ShieldCheck,
  Users,
  UserSquare2,
  X,
  type LucideIcon,
} from 'lucide-react';
import { useState } from 'react';
import { NavLink, Outlet, useLocation } from 'react-router-dom';
import { useAuth } from '../auth/AuthProvider';
import { cx, useConfirm } from './ui';

interface NavItem {
  to: string;
  label: string;
  icon: LucideIcon;
  admin?: boolean;
  mobile?: boolean;
}
const NAV: NavItem[] = [
  { to: '/', label: 'Panel', icon: LayoutDashboard, mobile: true },
  { to: '/conductores', label: 'Conductores', icon: UserSquare2, mobile: true },
  { to: '/motocicletas', label: 'Motocicletas', icon: Bike, mobile: true },
  { to: '/documentos', label: 'Documentos', icon: FileText, mobile: true },
  { to: '/reportes', label: 'Reportes', icon: ClipboardList },
  { to: '/usuarios', label: 'Usuarios', icon: Users, admin: true },
  { to: '/auditoria', label: 'Auditoría', icon: ShieldCheck, admin: true },
  { to: '/configuracion', label: 'Configuración', icon: Settings, admin: true },
];

export function Logo({ size = 40 }: { size?: number }) {
  return (
    <img
      src={`${import.meta.env.BASE_URL}brand/yummy-logo.webp`}
      alt="Yummy Rides Maracay"
      width={size}
      height={size}
      className="rounded-full ring-2 ring-yummy-500/60"
    />
  );
}

export default function Layout() {
  const { profile, isAdmin, signOut } = useAuth();
  const confirm = useConfirm();
  const [open, setOpen] = useState(false);
  const loc = useLocation();
  const items = NAV.filter((n) => !n.admin || isAdmin);

  async function logout() {
    if (await confirm({ title: 'Cerrar sesión', message: '¿Desea salir del sistema?', confirmText: 'Salir' })) await signOut();
  }

  const link = (n: NavItem) => (
    <NavLink
      key={n.to}
      to={n.to}
      end={n.to === '/'}
      onClick={() => setOpen(false)}
      className={({ isActive }) =>
        cx(
          'flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition',
          isActive ? 'bg-yummy-500/20 text-white ring-1 ring-yummy-500/50' : 'text-gray-400 hover:bg-ink-700 hover:text-white',
        )
      }
    >
      <n.icon className="h-5 w-5" /> {n.label}
    </NavLink>
  );

  const sidebar = (
    <div className="flex h-full flex-col">
      <div className="flex items-center gap-3 px-2 pb-6">
        <Logo size={44} />
        <div className="leading-tight">
          <p className="text-sm font-bold text-white">Yummy Rides</p>
          <p className="text-xs text-yummy-300">Control Maracay</p>
        </div>
      </div>
      <nav className="flex flex-1 flex-col gap-1">{items.map(link)}</nav>
      <div className="mt-4 rounded-xl border border-ink-600 bg-ink-900/60 p-3">
        <p className="truncate text-sm font-medium text-white">{profile?.full_name || profile?.email}</p>
        <p className="text-xs text-yummy-300">{isAdmin ? 'Administrador principal' : 'Operador administrativo'}</p>
        <button onClick={logout} className="mt-2 flex items-center gap-2 text-xs text-gray-400 hover:text-white">
          <LogOut className="h-4 w-4" /> Cerrar sesión
        </button>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-ink-900 bg-[radial-gradient(ellipse_at_top,rgba(160,32,240,0.12),transparent_55%)] text-gray-100">
      {/* Escritorio */}
      <aside className="fixed inset-y-0 left-0 hidden w-64 border-r border-ink-600 bg-ink-800/90 p-4 backdrop-blur lg:block">{sidebar}</aside>

      {/* Barra superior móvil */}
      <header className="sticky top-0 z-30 flex items-center justify-between border-b border-ink-600 bg-ink-900/90 px-4 py-3 backdrop-blur lg:hidden">
        <div className="flex items-center gap-2">
          <Logo size={32} />
          <span className="text-sm font-bold text-white">Yummy Control</span>
        </div>
        <button onClick={() => setOpen(true)} className="rounded-lg p-2 text-gray-300 hover:bg-ink-700" aria-label="Abrir menú">
          <Menu className="h-5 w-5" />
        </button>
      </header>

      {/* Menú deslizante móvil */}
      {open && (
        <div className="fixed inset-0 z-40 bg-black/60 lg:hidden" onClick={() => setOpen(false)}>
          <div className="h-full w-72 animate-fadein bg-ink-800 p-4" onClick={(e) => e.stopPropagation()}>
            <button onClick={() => setOpen(false)} className="mb-2 ml-auto block rounded-lg p-1 text-gray-400" aria-label="Cerrar menú">
              <X className="h-5 w-5" />
            </button>
            {sidebar}
          </div>
        </div>
      )}

      <main key={loc.pathname} className="animate-fadein px-4 pb-28 pt-5 sm:px-6 lg:ml-64 lg:px-8 lg:pb-10 lg:pt-8">
        <div className="mx-auto max-w-7xl">
          <Outlet />
        </div>
      </main>

      {/* Navegación inferior móvil */}
      <nav className="fixed inset-x-0 bottom-0 z-30 grid grid-cols-4 border-t border-ink-600 bg-ink-800/95 pb-[env(safe-area-inset-bottom)] backdrop-blur lg:hidden">
        {NAV.filter((n) => n.mobile).map((n) => (
          <NavLink
            key={n.to}
            to={n.to}
            end={n.to === '/'}
            className={({ isActive }) =>
              cx('flex flex-col items-center gap-1 py-2.5 text-[11px]', isActive ? 'text-yummy-300' : 'text-gray-400')
            }
          >
            <n.icon className="h-5 w-5" />
            {n.label}
          </NavLink>
        ))}
      </nav>
    </div>
  );
}
