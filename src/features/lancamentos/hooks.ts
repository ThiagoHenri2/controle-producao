import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { categoriaKeys } from '@/features/categorias/hooks';
import {
  createLancamentos,
  deleteLancamento,
  listLancamentosDoDia,
  updateLancamento,
  type LancamentoComCategoria,
  type LancamentoPatch,
  type NovoLancamentoItem,
} from './api';
import type { LancamentoError } from './errors';

export const lancamentoKeys = {
  all: ['lancamentos'] as const,
  dia: (data: string) => [...lancamentoKeys.all, data] as const,
};

/** Prefixo das queries do relatório (`['resumo', de, ate]`, spec 005). */
export const resumoPrefixKey = ['resumo'] as const;

export function useLancamentosDoDia(data: string) {
  return useQuery<LancamentoComCategoria[], LancamentoError>({
    queryKey: lancamentoKeys.dia(data),
    queryFn: () => listLancamentosDoDia(data),
  });
}

/** Invalida a lista do dia e o relatório; se a categoria era o problema, recarrega as categorias. */
function useInvalidateAfterMutation() {
  const queryClient = useQueryClient();
  return (data: string, error: LancamentoError | null) => {
    const tasks = [
      queryClient.invalidateQueries({ queryKey: lancamentoKeys.dia(data) }),
      queryClient.invalidateQueries({ queryKey: resumoPrefixKey }),
    ];
    if (error?.kind === 'categoria_inativa' || error?.kind === 'categoria_invalida') {
      tasks.push(queryClient.invalidateQueries({ queryKey: categoriaKeys.all }));
    }
    return Promise.all(tasks);
  };
}

export type CreateLancamentosVars = { data: string; itens: NovoLancamentoItem[] };

export function useCreateLancamentos() {
  const invalidate = useInvalidateAfterMutation();
  return useMutation<LancamentoComCategoria[], LancamentoError, CreateLancamentosVars>({
    mutationFn: ({ data, itens }) => createLancamentos(data, itens),
    onSettled: (_res, error, vars) => invalidate(vars.data, error),
  });
}

export type UpdateLancamentoVars = { id: string; data: string; patch: LancamentoPatch };

export function useUpdateLancamento() {
  const invalidate = useInvalidateAfterMutation();
  return useMutation<LancamentoComCategoria, LancamentoError, UpdateLancamentoVars>({
    mutationFn: ({ id, patch }) => updateLancamento(id, patch),
    onSettled: (_res, error, vars) => invalidate(vars.data, error),
  });
}

export type DeleteLancamentoVars = { id: string; data: string };

export function useDeleteLancamento() {
  const invalidate = useInvalidateAfterMutation();
  return useMutation<void, LancamentoError, DeleteLancamentoVars>({
    mutationFn: ({ id }) => deleteLancamento(id),
    onSettled: (_res, error, vars) => invalidate(vars.data, error),
  });
}
