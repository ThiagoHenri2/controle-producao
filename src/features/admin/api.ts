import {
  FunctionsFetchError,
  FunctionsHttpError,
  FunctionsRelayError,
} from '@supabase/supabase-js';
import type { ProfileRole, Tables } from '@/lib/database.types';
import { supabase } from '@/lib/supabase';
import type { NewUserInput } from './schemas';

/** Dados de usuário que a tela de admin mostra (nada de lançamentos/valores). */
export type AdminUser = Pick<Tables<'profiles'>, 'id' | 'username' | 'nome' | 'role' | 'ativo'>;

export type AdminUsersRequest =
  | ({ action: 'create' } & NewUserInput)
  | { action: 'reset_password'; user_id: string; password: string }
  | { action: 'set_active'; user_id: string; ativo: boolean }
  | { action: 'set_role'; user_id: string; role: ProfileRole };

export type AdminUsersResponse = { ok: true; user?: AdminUser };

export const ADMIN_ERROR_MESSAGES = {
  400: 'Dados inválidos.',
  401: 'Sua sessão expirou. Entre de novo.',
  403: 'Acesso negado',
  409: 'Usuário já existe',
  network: 'Sem conexão com o servidor. Tente de novo.',
  unexpected: 'Não foi possível concluir. Tente de novo.',
} as const;

/** Erro da função `admin-users` com a mensagem pronta para o usuário. */
export class AdminUsersError extends Error {
  readonly status: number | null;
  constructor(message: string, status: number | null) {
    super(message);
    this.name = 'AdminUsersError';
    this.status = status;
  }
}

type ResponseLike = { status?: unknown; json?: unknown };

function fallbackFor(status: number | null): string {
  switch (status) {
    case 400:
    case 401:
    case 403:
    case 409:
      return ADMIN_ERROR_MESSAGES[status];
    default:
      return ADMIN_ERROR_MESSAGES.unexpected;
  }
}

/**
 * Converte o erro do `functions.invoke` em `AdminUsersError`.
 *
 * Status não-2xx vira `FunctionsHttpError`; o corpo `{ error }` fica em
 * `error.context` (um `Response`), lido com `await error.context.json()`.
 */
export async function toAdminUsersError(error: unknown): Promise<AdminUsersError> {
  if (error instanceof AdminUsersError) return error;

  if (error instanceof FunctionsHttpError) {
    const context = (error.context ?? {}) as ResponseLike;
    const status = typeof context.status === 'number' ? context.status : null;
    let message: string | null = null;
    if (typeof context.json === 'function') {
      try {
        const body: unknown = await (context.json as () => Promise<unknown>)();
        if (
          body &&
          typeof body === 'object' &&
          'error' in body &&
          typeof body.error === 'string' &&
          body.error.trim()
        ) {
          message = body.error;
        }
      } catch {
        // corpo não é JSON: usa a mensagem padrão do status
      }
    }
    return new AdminUsersError(message ?? fallbackFor(status), status);
  }

  if (error instanceof FunctionsFetchError || error instanceof FunctionsRelayError) {
    return new AdminUsersError(ADMIN_ERROR_MESSAGES.network, null);
  }

  return new AdminUsersError(ADMIN_ERROR_MESSAGES.unexpected, null);
}

/** Chama a Edge Function `admin-users`. Lança `AdminUsersError` em falha. */
export async function invokeAdminUsers(body: AdminUsersRequest): Promise<AdminUsersResponse> {
  let result;
  try {
    result = await supabase.functions.invoke<AdminUsersResponse>('admin-users', { body });
  } catch (err) {
    throw await toAdminUsersError(err);
  }
  if (result.error) throw await toAdminUsersError(result.error);
  if (!result.data?.ok) throw new AdminUsersError(ADMIN_ERROR_MESSAGES.unexpected, null);
  return result.data;
}

/** Lista de usuários (a RLS libera todos os profiles ao admin), ordenada por nome. */
export async function listProfiles(): Promise<AdminUser[]> {
  const { data, error } = await supabase
    .from('profiles')
    .select('id, username, nome, role, ativo')
    .order('nome', { ascending: true });
  if (error) throw error;
  return data;
}

export const createUser = (input: NewUserInput) => invokeAdminUsers({ action: 'create', ...input });

export const resetPassword = (userId: string, password: string) =>
  invokeAdminUsers({ action: 'reset_password', user_id: userId, password });

export const setUserActive = (userId: string, ativo: boolean) =>
  invokeAdminUsers({ action: 'set_active', user_id: userId, ativo });

export const setUserRole = (userId: string, role: ProfileRole) =>
  invokeAdminUsers({ action: 'set_role', user_id: userId, role });
