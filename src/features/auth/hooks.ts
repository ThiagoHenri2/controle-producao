import { useMutation, useQuery } from '@tanstack/react-query';
import {
  changeOwnPassword,
  fetchMeuGerente,
  fetchProfile,
  type ChangePasswordError,
  type MeuGerente,
} from './api';

export const authKeys = {
  all: ['auth'] as const,
  profile: (userId: string) => [...authKeys.all, 'profile', userId] as const,
  meuGerente: (userId: string) => [...authKeys.all, 'meu-gerente', userId] as const,
};

export function profileQueryOptions(userId: string) {
  return {
    queryKey: authKeys.profile(userId),
    queryFn: () => fetchProfile(userId),
    staleTime: 5 * 60_000,
  };
}

/** Perfil do usuário logado (desligado enquanto não há sessão). */
export function useProfile(userId: string | undefined) {
  return useQuery({
    ...profileQueryOptions(userId ?? ''),
    enabled: Boolean(userId),
  });
}

/** Gerente responsável pelo usuário logado (Minha conta, spec 010). */
export function useMeuGerente(userId: string | undefined) {
  return useQuery<MeuGerente | null, Error>({
    queryKey: authKeys.meuGerente(userId ?? ''),
    queryFn: fetchMeuGerente,
    enabled: Boolean(userId),
    staleTime: 60_000,
  });
}

/**
 * Troca da própria senha. Não há query a invalidar: a senha não é exibida em
 * lugar nenhum e o perfil não muda.
 */
export function useChangePassword() {
  return useMutation<void, ChangePasswordError, { username: string; atual: string; nova: string }>({
    mutationFn: changeOwnPassword,
  });
}
