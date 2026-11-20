import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import type { AuthError, Session } from '@supabase/supabase-js';
import { AUTH_MESSAGES, SignInError, usernameToEmail } from '@/lib/auth';
import { supabase } from '@/lib/supabase';
import { AuthContext, type AuthContextValue } from './auth-context';
import { profileQueryOptions, useProfile } from './hooks';

/** Falha de rede/servidor (não é "senha errada"). */
function isUnexpectedAuthError(error: AuthError): boolean {
  return error.name === 'AuthRetryableFetchError' || (error.status ?? 0) >= 500;
}

/**
 * Mantém a sessão do Supabase e o perfil do usuário logado.
 *
 * O callback de `onAuthStateChange` só atualiza estado (sem `await` de
 * chamadas ao Supabase, para evitar o deadlock conhecido do supabase-js). O
 * perfil é buscado pelo TanStack Query, reagindo à mudança de sessão.
 */
export function AuthProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient();
  const [session, setSession] = useState<Session | null>(null);
  const [initialized, setInitialized] = useState(false);

  useEffect(() => {
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession);
      setInitialized(true);
    });
    return () => subscription.unsubscribe();
  }, []);

  const userId = session?.user.id;
  const profileQuery = useProfile(userId);
  const profile = profileQuery.data ?? null;

  const signOut = useCallback(async () => {
    try {
      await supabase.auth.signOut();
    } finally {
      setSession(null);
      queryClient.clear();
    }
  }, [queryClient]);

  // Sessão persistida de um usuário desativado (ou sem perfil): derruba.
  const mustKick = Boolean(userId) && profileQuery.isSuccess && !profileQuery.data?.ativo;
  useEffect(() => {
    if (mustKick) void signOut();
  }, [mustKick, signOut]);

  const signIn = useCallback(
    async (username: string, password: string) => {
      const { data, error } = await supabase.auth.signInWithPassword({
        email: usernameToEmail(username),
        password,
      });
      if (error || !data.user) {
        throw new SignInError(
          error && isUnexpectedAuthError(error)
            ? AUTH_MESSAGES.unexpected
            : AUTH_MESSAGES.invalidCredentials,
        );
      }

      let loaded;
      try {
        loaded = await queryClient.fetchQuery({
          ...profileQueryOptions(data.user.id),
          staleTime: 0,
        });
      } catch {
        await signOut();
        throw new SignInError(AUTH_MESSAGES.unexpected);
      }
      if (!loaded?.ativo) {
        await signOut();
        throw new SignInError(AUTH_MESSAGES.inactive);
      }
    },
    [queryClient, signOut],
  );

  const value = useMemo<AuthContextValue>(() => {
    const isAuthenticated = Boolean(session) && profile?.ativo === true;
    return {
      session,
      profile,
      isAuthenticated,
      isAdmin: isAuthenticated && profile?.role === 'admin',
      loading: !initialized || (Boolean(session) && profileQuery.isPending),
      signIn,
      signOut,
    };
  }, [session, profile, initialized, profileQuery.isPending, signIn, signOut]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
