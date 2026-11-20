import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { resumoPrefixKey } from '@/features/lancamentos/hooks';
import {
  createDespesa,
  deleteDespesa,
  listDespesasDoDia,
  updateDespesa,
  type DespesaComCategoria,
  type DespesaPatch,
  type NovaDespesa,
} from './api';
import type { DespesaError } from './errors';
import { categoriaDespesaKeys, despesaKeys } from './keys';

export { despesaKeys };

export function useDespesasDoDia(userId: string, data: string) {
  return useQuery<DespesaComCategoria[], DespesaError>({
    queryKey: despesaKeys.dia(userId, data),
    queryFn: () => listDespesasDoDia(userId, data),
    enabled: Boolean(userId),
  });
}

/**
 * Invalida a lista do dia do dono, o prefixo `['resumo']` (Relatório e Equipe,
 * inclusive as keys de despesas) e, se a categoria era o problema, as categorias de despesa.
 */
function useInvalidateAfterMutation() {
  const queryClient = useQueryClient();
  return (userId: string, data: string, error: DespesaError | null) => {
    const tasks = [
      queryClient.invalidateQueries({ queryKey: despesaKeys.dia(userId, data) }),
      queryClient.invalidateQueries({ queryKey: resumoPrefixKey }),
    ];
    if (error?.kind === 'categoria_inativa' || error?.kind === 'categoria_invalida') {
      tasks.push(queryClient.invalidateQueries({ queryKey: categoriaDespesaKeys.user(userId) }));
    }
    return Promise.all(tasks);
  };
}

export function useCreateDespesa() {
  const invalidate = useInvalidateAfterMutation();
  return useMutation<DespesaComCategoria, DespesaError, NovaDespesa>({
    mutationFn: createDespesa,
    onSettled: (_res, error, vars) => invalidate(vars.user_id, vars.data, error),
  });
}

export type UpdateDespesaVars = { id: string; userId: string; data: string; patch: DespesaPatch };

export function useUpdateDespesa() {
  const invalidate = useInvalidateAfterMutation();
  return useMutation<DespesaComCategoria, DespesaError, UpdateDespesaVars>({
    mutationFn: ({ id, patch }) => updateDespesa(id, patch),
    onSettled: (_res, error, vars) => invalidate(vars.userId, vars.data, error),
  });
}

export type DeleteDespesaVars = { id: string; userId: string; data: string };

export function useDeleteDespesa() {
  const invalidate = useInvalidateAfterMutation();
  return useMutation<void, DespesaError, DeleteDespesaVars>({
    mutationFn: ({ id }) => deleteDespesa(id),
    onSettled: (_res, error, vars) => invalidate(vars.userId, vars.data, error),
  });
}
