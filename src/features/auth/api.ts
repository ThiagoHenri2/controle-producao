import type { Tables } from '@/lib/database.types';
import { usernameToEmail } from '@/lib/auth';
import { supabase } from '@/lib/supabase';

export type Profile = Tables<'profiles'>;

/** Perfil do usuário logado. `null` quando não existe linha em `profiles`. */
export async function fetchProfile(userId: string): Promise<Profile | null> {
  const { data, error } = await supabase
    .from('profiles')
    .select('id, username, nome, role, ativo, gerente_id, created_at')
    .eq('id', userId)
    .maybeSingle();
  if (error) throw error;
  return data;
}

export type MeuGerente = { id: string; nome: string; username: string };

/**
 * Gerente responsável pelo usuário logado (RPC `meu_gerente`, migration 0008).
 * `null` quando não tem. A RPC é necessária porque a RLS esconde o perfil do
 * gerente do atendente.
 */
export async function fetchMeuGerente(): Promise<MeuGerente | null> {
  const { data, error } = await supabase.rpc('meu_gerente');
  if (error) throw error;
  return data?.[0] ?? null;
}

export const CHANGE_PASSWORD_MESSAGES = {
  wrongCurrent: 'Senha atual incorreta.',
  weak: 'Senha fraca. Escolha outra, com pelo menos 6 caracteres.',
  same: 'A nova senha precisa ser diferente da atual.',
  unexpected: 'Não foi possível trocar a senha. Verifique sua conexão e tente de novo.',
} as const;

/** Erro da troca de senha; `field` indica abaixo de qual campo mostrar. */
export class ChangePasswordError extends Error {
  readonly field: 'atual' | 'nova' | null;
  constructor(message: string, field: 'atual' | 'nova' | null) {
    super(message);
    this.name = 'ChangePasswordError';
    this.field = field;
  }
}

type AuthErrorLike = { code?: string; status?: number; name?: string } | null;

function isNetworkOrServer(error: AuthErrorLike): boolean {
  return error?.name === 'AuthRetryableFetchError' || (error?.status ?? 0) >= 500;
}

/**
 * Troca a própria senha (spec 010, sem backend novo):
 * 1. confere a senha atual com `signInWithPassword` (o e-mail sintético vem do username);
 * 2. grava a nova com `updateUser`.
 * Lança `ChangePasswordError` com a mensagem pronta.
 */
export async function changeOwnPassword(input: {
  username: string;
  atual: string;
  nova: string;
}): Promise<void> {
  try {
    await trocarSenha(input);
  } catch (err) {
    if (err instanceof ChangePasswordError) throw err;
    throw new ChangePasswordError(CHANGE_PASSWORD_MESSAGES.unexpected, null);
  }
}

async function trocarSenha(input: { username: string; atual: string; nova: string }) {
  const check = await supabase.auth.signInWithPassword({
    email: usernameToEmail(input.username),
    password: input.atual,
  });
  if (check.error) {
    throw isNetworkOrServer(check.error)
      ? new ChangePasswordError(CHANGE_PASSWORD_MESSAGES.unexpected, null)
      : new ChangePasswordError(CHANGE_PASSWORD_MESSAGES.wrongCurrent, 'atual');
  }

  const { error } = await supabase.auth.updateUser({ password: input.nova });
  if (error) {
    if (error.code === 'weak_password') {
      throw new ChangePasswordError(CHANGE_PASSWORD_MESSAGES.weak, 'nova');
    }
    if (error.code === 'same_password') {
      throw new ChangePasswordError(CHANGE_PASSWORD_MESSAGES.same, 'nova');
    }
    throw new ChangePasswordError(CHANGE_PASSWORD_MESSAGES.unexpected, null);
  }
}
