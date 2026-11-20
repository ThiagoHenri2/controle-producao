import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  createCategoria,
  deleteCategoria,
  listCategorias,
  listNomesCategorias,
  updateCategoria,
  type Categoria,
  type CategoriaInsert,
  type CategoriaPatch,
} from './api';
import type { CategoriaError } from './errors';

/**
 * Query keys de categorias. As listas são por dono (`userId`): o gestor vê as
 * categorias do entregador alvo (spec 008).
 */
export const categoriaKeys = {
  all: ['categorias'] as const,
  lists: () => [...categoriaKeys.all, 'list'] as const,
  user: (userId: string) => [...categoriaKeys.lists(), userId] as const,
  list: (userId: string, incluirInativas: boolean) =>
    [...categoriaKeys.user(userId), { incluirInativas }] as const,
  /** Nomes de todas as categorias visíveis (filtro da tela Equipe). */
  nomes: () => [...categoriaKeys.all, 'nomes'] as const,
};

/** Categorias de `userId`. Use `incluirInativas: false` na tela Lançar. */
export function useCategorias(
  userId: string,
  { incluirInativas = false }: { incluirInativas?: boolean } = {},
) {
  return useQuery<Categoria[], CategoriaError>({
    queryKey: categoriaKeys.list(userId, incluirInativas),
    queryFn: () => listCategorias(userId, { incluirInativas }),
    enabled: Boolean(userId),
  });
}

/** Nomes de todas as categorias visíveis ao usuário (o gestor vê as de todos). */
export function useNomesCategorias({ enabled = true }: { enabled?: boolean } = {}) {
  return useQuery<string[], CategoriaError>({
    queryKey: categoriaKeys.nomes(),
    queryFn: listNomesCategorias,
    enabled,
  });
}

/** Invalida as listas do dono afetado e os nomes (filtro da Equipe). */
function useInvalidateCategorias() {
  const queryClient = useQueryClient();
  return (userId: string) =>
    Promise.all([
      queryClient.invalidateQueries({ queryKey: categoriaKeys.user(userId) }),
      queryClient.invalidateQueries({ queryKey: categoriaKeys.nomes() }),
    ]);
}

export function useCreateCategoria() {
  const invalidate = useInvalidateCategorias();
  return useMutation<Categoria, CategoriaError, CategoriaInsert>({
    mutationFn: createCategoria,
    onSettled: (_res, _err, vars) => invalidate(vars.user_id),
  });
}

export type UpdateCategoriaVars = { id: string; userId: string; patch: CategoriaPatch };

export function useUpdateCategoria() {
  const invalidate = useInvalidateCategorias();
  return useMutation<Categoria, CategoriaError, UpdateCategoriaVars>({
    mutationFn: ({ id, patch }) => updateCategoria(id, patch),
    onSettled: (_res, _err, vars) => invalidate(vars.userId),
  });
}

export type DeleteCategoriaVars = { id: string; userId: string };

export function useDeleteCategoria() {
  const invalidate = useInvalidateCategorias();
  return useMutation<void, CategoriaError, DeleteCategoriaVars>({
    mutationFn: ({ id }) => deleteCategoria(id),
    onSettled: (_res, _err, vars) => invalidate(vars.userId),
  });
}
