import { lazy, Suspense, type ReactNode } from 'react';
import { HashRouter, Navigate, Route, Routes } from 'react-router-dom';
import { AuthProvider, useAuth } from './auth/AuthProvider';
import Layout from './components/Layout';
import { FeedbackProvider, Spinner } from './components/ui';
import { isConfigured } from './lib/supabase';
import Login from './pages/Login';
import NotConfigured from './pages/NotConfigured';

const Dashboard = lazy(() => import('./pages/Dashboard'));
const Drivers = lazy(() => import('./pages/Drivers'));
const DriverWizard = lazy(() => import('./pages/DriverWizard'));
const DriverDetail = lazy(() => import('./pages/DriverDetail'));
const Motorcycles = lazy(() => import('./pages/Motorcycles'));
const MotorcycleDetail = lazy(() => import('./pages/MotorcycleDetail'));
const Documents = lazy(() => import('./pages/Documents'));
const Reports = lazy(() => import('./pages/Reports'));
const UsersPage = lazy(() => import('./pages/Users'));
const Audit = lazy(() => import('./pages/Audit'));
const SettingsPage = lazy(() => import('./pages/Settings'));

/** Protección de rutas en el cliente. La protección real está en RLS (servidor). */
function Protected({ children, admin }: { children: ReactNode; admin?: boolean }) {
  const { session, profile, loading, isAdmin } = useAuth();
  if (loading) return <Spinner label="Verificando sesión…" />;
  if (!session || !profile?.active) return <Navigate to="/login" replace />;
  if (admin && !isAdmin) return <Navigate to="/" replace />;
  return <>{children}</>;
}

function LoginRoute() {
  const { session, profile, loading } = useAuth();
  if (loading) return <Spinner label="Verificando sesión…" />;
  if (session && profile?.active) return <Navigate to="/" replace />;
  return <Login />;
}

export default function App() {
  if (!isConfigured) return <NotConfigured />;
  return (
    <AuthProvider>
      <FeedbackProvider>
        {/* HashRouter: funciona en GitHub Pages sin reglas de reescritura */}
        <HashRouter>
          <Suspense fallback={<Spinner />}>
            <Routes>
              <Route path="/login" element={<LoginRoute />} />
              <Route
                element={
                  <Protected>
                    <Layout />
                  </Protected>
                }
              >
                <Route index element={<Dashboard />} />
                <Route path="conductores" element={<Drivers />} />
                <Route path="conductores/nuevo" element={<DriverWizard />} />
                <Route path="conductores/:id" element={<DriverDetail />} />
                <Route path="conductores/:id/editar" element={<DriverWizard />} />
                <Route path="motocicletas" element={<Motorcycles />} />
                <Route path="motocicletas/:id" element={<MotorcycleDetail />} />
                <Route path="documentos" element={<Documents />} />
                <Route path="reportes" element={<Reports />} />
                <Route path="usuarios" element={<Protected admin><UsersPage /></Protected>} />
                <Route path="auditoria" element={<Protected admin><Audit /></Protected>} />
                <Route path="configuracion" element={<Protected admin><SettingsPage /></Protected>} />
                <Route path="*" element={<Navigate to="/" replace />} />
              </Route>
            </Routes>
          </Suspense>
        </HashRouter>
      </FeedbackProvider>
    </AuthProvider>
  );
}
