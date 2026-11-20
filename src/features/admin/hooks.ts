import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { resumoKeys } from '@/features/relatorio/hooks';
import type { ProfileRole } from '@/lib/database.types';
import {
  createUser,
  listProfiles,
  resetPassword,
  setUserActive,
  setUserRole,
  type AdminUsersError,
  type AdminUsersResponse,
} from './api';
import type { NewUserInput } from './schemas';

export const adminKeys = {
  all: ['admin'] as const,
  users: () => [...adminKeys.all, 'users'] as const,
};

/** Lista de usuários para a tela de admin. */
export function useAdminUsers() {
  return useQuery({ queryKey: adminKeys.users(), queryFn: listProfiles });
}

/** Lista de usuários (também usada pelo seletor de entregador) e a Equipe (papel/ativo). */
function useInvalidateUsers() {
  const queryClient = useQueryClient();
  return () =>
    Promise.all([
      queryClient.invalidateQueries({ queryKey: adminKeys.users() }),
      queryClient.invalidateQueries({ queryKey: [...resumoKeys.all, 'equipe'] }),
    ]);
}

export function useCreateUser() {
  const invalidate = useInvalidateUsers();
  return useMutation<AdminUsersResponse, AdminUsersError, NewUserInput>({
    mutationFn: createUser,
    onSuccess: invalidate,
  });
}

export function useResetPassword() {
  const invalidate = useInvalidateUsers();
  return useMutation<AdminUsersResponse, AdminUsersError, { userId: string; password: string }>({
    mutationFn: ({ userId, password }) => resetPassword(userId, password),
    onSuccess: invalidate,
  });
}

export function useSetUserActive() {
  const invalidate = useInvalidateUsers();
  return useMutation<AdminUsersResponse, AdminUsersError, { userId: string; ativo: boolean }>({
    mutationFn: ({ userId, ativo }) => setUserActive(userId, ativo),
    onSuccess: invalidate,
  });
}

export function useSetUserRole() {
  const invalidate = useInvalidateUsers();
  return useMutation<AdminUsersResponse, AdminUsersError, { userId: string; role: ProfileRole }>({
    mutationFn: ({ userId, role }) => setUserRole(userId, role),
    onSuccess: invalidate,
  });
}
