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
/** Resposta de uma RPC simulada, no formato do supabase-js. */
export type RpcResult = { data: unknown; error: { code: string; message: string } | null };
export type RpcHandler = (args: Record<string, unknown>) => RpcResult | Promise<RpcResult>;
type Account = { password: string; profile: Profile | null };

export function makeProfile(overrides: Partial<Profile> = {}): Profile {
  return {
    id: 'user-1',
    username: 'joao',
    nome: 'João',
    role: 'user',
    ativo: true,
    gerente_id: null,
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
  /** Código de erro da próxima chamada a `updateUser`. */
  let nextUpdateUserError: string | null = null;

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
    /**
     * Troca a senha da conta logada (Minha conta, spec 010). Use
     * `failNextUpdateUser(code)` para simular `weak_password` etc.
     */
    updateUser: vi.fn(async ({ password }: { password?: string }) => {
      const failCode = nextUpdateUserError;
      nextUpdateUserError = null;
      if (failCode) {
        return {
          data: { user: null },
          error: { name: 'AuthApiError', status: 422, code: failCode, message: failCode },
        };
      }
      const entry = [...accounts.entries()].find(
        ([, a]) => session && (a.profile?.id ?? '') === session.user.id,
      );
      if (!session || !entry) {
        return {
          data: { user: null },
          error: { name: 'AuthSessionMissingError', status: 400, message: 'no session' },
        };
      }
      if (password !== undefined) {
        if (password === entry[1].password) {
          return {
            data: { user: null },
            error: {
              name: 'AuthApiError',
              status: 422,
              code: 'same_password',
              message: 'same_password',
            },
          };
        }
        accounts.set(entry[0], { ...entry[1], password });
      }
      return { data: { user: session.user }, error: null };
    }),
    signOut: vi.fn(async () => {
      session = null;
      emit('SIGNED_OUT');
      return { error: null };
    }),
  };

  /** Tabelas extras simuladas por feature (ver `setTableHandler`). */
  const tableHandlers = new Map<string, () => unknown>();

  const from = vi.fn((table: string) => {
    const handler = tableHandlers.get(table);
    if (handler) return handler();
    return profilesTable(table);
  });

  /** Perfis visíveis na listagem (o gestor vê todos pela RLS da 0006). */
  const listaPerfis = () =>
    [...profiles.values()]
      .filter((p): p is Profile => p !== null)
      .sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'));

  const profilesTable = (table: string) => {
    if (table !== 'profiles') throw new Error(`Tabela não simulada: ${table}`);
    return {
      select: () => ({
        eq: (_column: string, value: string) => ({
          maybeSingle: async () => ({ data: profiles.get(value) ?? null, error: null }),
        }),
        order: async () => ({ data: listaPerfis(), error: null }),
      }),
    };
  };

  /** RPCs simuladas por feature (ver `setRpcHandler`). */
  const rpcHandlers = new Map<string, RpcHandler>();

  const rpc = vi.fn(async (fn: string, args?: Record<string, unknown>) => {
    const handler = rpcHandlers.get(fn);
    if (!handler) throw new Error(`RPC não simulada: ${fn}`);
    return handler(args ?? {});
  });

  /** Edge Functions (`supabase.functions.invoke`): sucesso `{ ok: true }` por padrão. */
  const functions = {
    invoke: vi.fn(
      async (
        _fn: string,
        _opts?: { body?: unknown },
      ): Promise<{ data: unknown; error: unknown }> => ({ data: { ok: true }, error: null }),
    ),
  };

  return {
    client: { auth, from, rpc, functions },
    auth,
    from,
    rpc,
    functions,
    /** Senha atual da conta (para conferir trocas de senha). */
    passwordOf(username: string): string | undefined {
      return accounts.get(`${username}@entregas.local`)?.password;
    },
    failNextUpdateUser(code: string) {
      nextUpdateUserError = code;
    },
    /** Cadastra um usuário que pode logar com `${username}@entregas.local`. */
    addAccount(username: string, password: string, profile: Profile | null) {
      accounts.set(`${username}@entregas.local`, { password, profile });
    },
    /** Cadastra perfis visíveis na listagem de `profiles` (seletor de atendente). */
    addProfiles(...list: Profile[]) {
      list.forEach((p) => profiles.set(p.id, p));
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
    /**
     * Simula outra tabela: `from(table)` passa a retornar `handler()`.
     * Ex.: `fakeSupabase.setTableHandler('categorias', fakeTable.handler)`.
     * O `reset()` remove os handlers registrados.
     */
    setTableHandler(table: string, handler: () => unknown) {
      tableHandlers.set(table, handler);
    },
    /**
     * Simula uma RPC: `rpc(fn, args)` passa a retornar `handler(args)`.
     * O handler devolve `{ data, error }` como o supabase-js. O `reset()` remove os handlers.
     */
    setRpcHandler(fn: string, handler: RpcHandler) {
      rpcHandlers.set(fn, handler);
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
      nextUpdateUserError = null;
      tableHandlers.clear();
      rpcHandlers.clear();
      vi.clearAllMocks();
      functions.invoke.mockReset();
      functions.invoke.mockResolvedValue({ data: { ok: true }, error: null });
    },
  };
}

export const fakeSupabase = createFakeSupabase();
