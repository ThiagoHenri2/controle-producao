/**
 * Supabase falso para testes de auth (sem rede e sem `.env.local`).
 *
 * Uso no arquivo de teste:
 *   vi.mock('@/lib/supabase', async () => ({
 *     supabase: (await import('@/test/supabaseMock')).fakeSupabase.client,
 *   }));
 */
import { vi } from 'vitest';
import type { AuthChangeEvent, Session } from '@supabase/supabase-js';
import type { Tables } from '@/lib/database.types';

type Profile = Tables<'profiles'>;
type Listener = (event: AuthChangeEvent, session: Session | null) => void;
type Account = { password: string; profile: Profile | null };

export function makeProfile(overrides: Partial<Profile> = {}): Profile {
  return {
    id: 'user-1',
    username: 'joao',
    nome: 'João',
    role: 'user',
    ativo: true,
    created_at: '2026-01-01T00:00:00Z',
    ...overrides,
  };
}

export function makeSession(userId: string): Session {
  return {
    access_token: 'token',
    refresh_token: 'refresh',
    expires_in: 3600,
    token_type: 'bearer',
    user: { id: userId, app_metadata: {}, user_metadata: {}, aud: 'authenticated', created_at: '' },
  } as Session;
}

function createFakeSupabase() {
  const listeners = new Set<Listener>();
  const accounts = new Map<string, Account>();
  const profiles = new Map<string, Profile | null>();
  let session: Session | null = null;
  /** Quando definido, o INITIAL_SESSION só é emitido ao chamar `resolveInitial()`. */
  let holdInitial = false;
  const pendingInitial: Listener[] = [];
  /** Controla a resposta do signInWithPassword (para testar o loading). */
  let signInGate: Promise<void> | null = null;

  const emit = (event: AuthChangeEvent) => listeners.forEach((l) => l(event, session));

  const auth = {
    onAuthStateChange: vi.fn((listener: Listener) => {
      listeners.add(listener);
      if (holdInitial) pendingInitial.push(listener);
      else queueMicrotask(() => listener('INITIAL_SESSION', session));
      return { data: { subscription: { unsubscribe: () => listeners.delete(listener) } } };
    }),
    signInWithPassword: vi.fn(async ({ email, password }: { email: string; password: string }) => {
      if (signInGate) await signInGate;
      const account = accounts.get(email);
      if (!account || account.password !== password) {
        return {
          data: { user: null, session: null },
          error: { name: 'AuthApiError', status: 400, message: 'Invalid login credentials' },
        };
      }
      const userId = account.profile?.id ?? `id-${email}`;
      profiles.set(userId, account.profile);
      session = makeSession(userId);
      emit('SIGNED_IN');
      return { data: { user: session.user, session }, error: null };
    }),
    signOut: vi.fn(async () => {
      session = null;
      emit('SIGNED_OUT');
      return { error: null };
    }),
  };

  const from = vi.fn((table: string) => ({
    select: () => ({
      eq: (_column: string, value: string) => ({
        maybeSingle: async () => {
          if (table !== 'profiles') throw new Error(`Tabela não simulada: ${table}`);
          return { data: profiles.get(value) ?? null, error: null };
        },
      }),
    }),
  }));

  return {
    client: { auth, from },
    auth,
    from,
    /** Cadastra um usuário que pode logar com `${username}@entregas.local`. */
    addAccount(username: string, password: string, profile: Profile | null) {
      accounts.set(`${username}@entregas.local`, { password, profile });
    },
    /** Simula uma sessão já persistida (reabrir o app). */
    setPersistedSession(profile: Profile) {
      profiles.set(profile.id, profile);
      session = makeSession(profile.id);
    },
    holdInitialSession() {
      holdInitial = true;
    },
    resolveInitial() {
      pendingInitial.splice(0).forEach((l) => l('INITIAL_SESSION', session));
    },
    /** Segura o signIn até chamar a função retornada. */
    holdSignIn(): () => void {
      let release = () => {};
      signInGate = new Promise<void>((resolve) => {
        release = () => {
          signInGate = null;
          resolve();
        };
      });
      return release;
    },
    reset() {
      listeners.clear();
      accounts.clear();
      profiles.clear();
      session = null;
      holdInitial = false;
      pendingInitial.length = 0;
      signInGate = null;
      vi.clearAllMocks();
    },
  };
}

export const fakeSupabase = createFakeSupabase();
