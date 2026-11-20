import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  createCategoria,
  deleteCategoria,
  listCategorias,
  updateCategoria,
  type Categoria,
  type CategoriaInsert,
  type CategoriaPatch,
} from './api';
import type { CategoriaError } from './errors';

export const categoriaKeys = {
  all: ['categorias'] as const,
  lists: () => [...categoriaKeys.all, 'list'] as const,
  list: (incluirInativas: boolean) => [...categoriaKeys.lists(), { incluirInativas }] as const,
};

/** Lista de categorias. Use `incluirInativas: false` na tela Lançar. */
export function useCategorias({ incluirInativas = false }: { incluirInativas?: boolean } = {}) {
  return useQuery<Categoria[], CategoriaError>({
    queryKey: categoriaKeys.list(incluirInativas),
    queryFn: () => listCategorias({ incluirInativas }),
  });
}

function useInvalidateCategorias() {
  const queryClient = useQueryClient();
  return () => queryClient.invalidateQueries({ queryKey: categoriaKeys.all });
}

export function useCreateCategoria() {
  const invalidate = useInvalidateCategorias();
  return useMutation<Categoria, CategoriaError, CategoriaInsert>({
    mutationFn: createCategoria,
    onSettled: invalidate,
  });
}

export type UpdateCategoriaVars = { id: string; patch: CategoriaPatch };

export function useUpdateCategoria() {
  const invalidate = useInvalidateCategorias();
  return useMutation<Categoria, CategoriaError, UpdateCategoriaVars>({
    mutationFn: ({ id, patch }) => updateCategoria(id, patch),
    onSettled: invalidate,
  });
}

export function useDeleteCategoria() {
  const invalidate = useInvalidateCategorias();
  return useMutation<void, CategoriaError, string>({
    mutationFn: deleteCategoria,
    onSettled: invalidate,
  });
}
