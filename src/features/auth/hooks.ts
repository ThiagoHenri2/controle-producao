import { useQuery } from '@tanstack/react-query';
import { fetchProfile } from './api';

export const authKeys = {
  all: ['auth'] as const,
  profile: (userId: string) => [...authKeys.all, 'profile', userId] as const,
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
