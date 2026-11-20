import { useMemo } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { categoriaKeys } from '@/features/categorias/hooks';
import {
  createLancamentos,
  deleteLancamento,
  fetchAutores,
  listLancamentosDoDia,
  updateLancamento,
  type LancamentoComCategoria,
  type LancamentoPatch,
  type NovoLancamentoItem,
} from './api';
import type { LancamentoError } from './errors';

/** Query keys de lançamentos: a lista do dia é por dono (o alvo do gestor, spec 008). */
export const lancamentoKeys = {
  all: ['lancamentos'] as const,
  user: (userId: string) => [...lancamentoKeys.all, userId] as const,
  dia: (userId: string, data: string) => [...lancamentoKeys.user(userId), data] as const,
  /** Nomes dos autores do selo "por <nome>": ids ordenados. */
  autores: (ids: readonly string[]) => ['autores', ids.join(',')] as const,
};

/** Prefixo das queries do relatório e da Equipe (`['resumo', …]`, specs 005/008). */
export const resumoPrefixKey = ['resumo'] as const;

export function useLancamentosDoDia(userId: string, data: string) {
  return useQuery<LancamentoComCategoria[], LancamentoError>({
    queryKey: lancamentoKeys.dia(userId, data),
    queryFn: () => listLancamentosDoDia(userId, data),
    enabled: Boolean(userId),
  });
}

/**
 * Nomes dos autores de uma lista (uma única query por lista). `ids` já vem
 * ordenado e sem repetição (`idsDeOutrosAutores`). Falha silenciosa: sem nome, sem selo.
 */
export function useAutores(ids: readonly string[]) {
  const query = useQuery({
    queryKey: lancamentoKeys.autores(ids),
    queryFn: () => fetchAutores(ids),
    enabled: ids.length > 0,
    staleTime: 10 * 60_000,
  });
  return useMemo(
    () => new Map((query.data ?? []).map((a) => [a.id, a.nome] as const)),
    [query.data],
  );
}

/**
 * Invalida a lista do dia do dono, o relatório/Equipe e, se a categoria era o
 * problema, as categorias do dono.
 */
function useInvalidateAfterMutation() {
  const queryClient = useQueryClient();
  return (userId: string, data: string, error: LancamentoError | null) => {
    const tasks = [
      queryClient.invalidateQueries({ queryKey: lancamentoKeys.dia(userId, data) }),
      queryClient.invalidateQueries({ queryKey: resumoPrefixKey }),
    ];
    if (error?.kind === 'categoria_inativa' || error?.kind === 'categoria_invalida') {
      tasks.push(queryClient.invalidateQueries({ queryKey: categoriaKeys.user(userId) }));
    }
    return Promise.all(tasks);
  };
}

export type CreateLancamentosVars = { userId: string; data: string; itens: NovoLancamentoItem[] };

export function useCreateLancamentos() {
  const invalidate = useInvalidateAfterMutation();
  return useMutation<LancamentoComCategoria[], LancamentoError, CreateLancamentosVars>({
    mutationFn: ({ userId, data, itens }) => createLancamentos(userId, data, itens),
    onSettled: (_res, error, vars) => invalidate(vars.userId, vars.data, error),
  });
}

export type UpdateLancamentoVars = {
  id: string;
  userId: string;
  data: string;
  patch: LancamentoPatch;
};

export function useUpdateLancamento() {
  const invalidate = useInvalidateAfterMutation();
  return useMutation<LancamentoComCategoria, LancamentoError, UpdateLancamentoVars>({
    mutationFn: ({ id, patch }) => updateLancamento(id, patch),
    onSettled: (_res, error, vars) => invalidate(vars.userId, vars.data, error),
  });
}

export type DeleteLancamentoVars = { id: string; userId: string; data: string };

export function useDeleteLancamento() {
  const invalidate = useInvalidateAfterMutation();
  return useMutation<void, LancamentoError, DeleteLancamentoVars>({
    mutationFn: ({ id }) => deleteLancamento(id),
    onSettled: (_res, error, vars) => invalidate(vars.userId, vars.data, error),
  });
}
