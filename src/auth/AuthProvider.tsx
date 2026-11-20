import type { Session } from '@supabase/supabase-js';
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { logEvent } from '../lib/audit';
import { friendlyError, supabase } from '../lib/supabase';
import type { UserProfile } from '../lib/types';

interface AuthState {
  session: Session | null;
  profile: UserProfile | null;
  loading: boolean;
  isAdmin: boolean;
  signIn: (email: string, password: string) => Promise<string | null>;
  signOut: () => Promise<void>;
  refreshProfile: () => Promise<void>;
}

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);

  const loadProfile = useCallback(async (s: Session | null) => {
    if (!s) {
      setProfile(null);
      return;
    }
    const { data } = await supabase.from('users_profiles').select('*').eq('id', s.user.id).maybeSingle();
    setProfile((data as UserProfile) ?? null);
  }, []);

  useEffect(() => {
    let mounted = true;
    supabase.auth.getSession().then(async ({ data }) => {
      if (!mounted) return;
      setSession(data.session);
      await loadProfile(data.session);
      setLoading(false);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_event, s) => {
      setSession(s);
      // Se difiere para no bloquear el callback de Supabase
      setTimeout(() => void loadProfile(s), 0);
    });
    return () => {
      mounted = false;
      sub.subscription.unsubscribe();
    };
  }, [loadProfile]);

  const signIn = useCallback(async (email: string, password: string) => {
    const { data, error } = await supabase.auth.signInWithPassword({ email: email.trim().toLowerCase(), password });
    if (error) return friendlyError(error);
    const { data: p } = await supabase.from('users_profiles').select('*').eq('id', data.user.id).maybeSingle();
    if (!p || !(p as UserProfile).active) {
      await supabase.auth.signOut();
      return 'Su usuario no está activo. Contacte al administrador principal.';
    }
    setProfile(p as UserProfile);
    void logEvent('LOGIN', 'Inicio de sesión');
    return null;
  }, []);

  const signOut = useCallback(async () => {
    await logEvent('LOGOUT', 'Cierre de sesión');
    await supabase.auth.signOut();
    setProfile(null);
  }, []);

  const value = useMemo<AuthState>(
    () => ({
      session,
      profile,
      loading,
      isAdmin: profile?.role === 'admin' && profile.active,
      signIn,
      signOut,
      refreshProfile: () => loadProfile(session),
    }),
    [session, profile, loading, signIn, signOut, loadProfile],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth fuera de AuthProvider');
  return ctx;
}
