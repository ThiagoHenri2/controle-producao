import { createContext, useContext } from 'react';
import type { Session } from '@supabase/supabase-js';
import type { ProfileRole } from '@/lib/database.types';
import type { Profile } from './api';

export type AuthContextValue = {
  session: Session | null;
  profile: Profile | null;
  /** Sessão válida E perfil ativo carregado. */
  isAuthenticated: boolean;
  /** Papel do perfil ativo; `null` sem sessão/perfil ativo. */
  role: ProfileRole | null;
  isAdmin: boolean;
  isGerente: boolean;
  /** Gestor = gerente OU admin, ativo (spec 008). */
  isGestor: boolean;
  /** true enquanto a sessão inicial (ou o perfil dela) ainda está sendo resolvida. */
  loading: boolean;
  /** Lança `SignInError` com a mensagem pronta para o usuário. */
  signIn: (username: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
};

export const AuthContext = createContext<AuthContextValue | null>(null);

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth precisa estar dentro de <AuthProvider>.');
  return ctx;
}
