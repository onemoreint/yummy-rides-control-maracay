import { Database } from 'lucide-react';

/** Se muestra cuando faltan las variables de Supabase. La app nunca simula datos. */
export default function NotConfigured() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-ink-900 p-6 text-gray-200">
      <div className="max-w-lg rounded-2xl border border-yummy-700 bg-ink-800 p-6">
        <Database className="mb-3 h-8 w-8 text-yummy-300" />
        <h1 className="text-xl font-bold text-white">Falta conectar la base de datos</h1>
        <p className="mt-2 text-sm text-gray-400">
          Esta aplicación necesita un proyecto de Supabase. No funciona con datos simulados.
        </p>
        <ol className="mt-4 list-decimal space-y-1 pl-5 text-sm">
          <li>
            Copie <code className="text-yummy-200">.env.example</code> como <code className="text-yummy-200">.env.local</code>.
          </li>
          <li>
            Complete <code className="text-yummy-200">VITE_SUPABASE_URL</code> y{' '}
            <code className="text-yummy-200">VITE_SUPABASE_ANON_KEY</code>.
          </li>
          <li>Aplique las migraciones de <code className="text-yummy-200">supabase/migrations</code>.</li>
          <li>Reinicie con <code className="text-yummy-200">npm run dev</code>.</li>
        </ol>
        <p className="mt-4 text-xs text-gray-500">Instrucciones completas en el README.md del proyecto.</p>
      </div>
    </div>
  );
}
