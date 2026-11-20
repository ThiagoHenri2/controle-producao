import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { Aba } from '@/features/despesas/aba';
import {
  createCategoriaDespesa,
  deleteCategoriaDespesa,
  listCategoriasDespesa,
  listNomesCategoriasDespesa,
  updateCategoriaDespesa,
  type CategoriaDespesa,
} from '@/features/despesas/api';
import { categoriaDespesaKeys, despesaKeys } from '@/features/despesas/keys';
import {
  createCategoria,
  deleteCategoria,
  listCategorias,
  listNomesCategorias,
  setVisibilidadeTodas,
  updateCategoria,
  type Categoria,
} from './api';
import { CATEGORIA_ERROR_MESSAGES, CategoriaError } from './errors';

export { categoriaDespesaKeys };

/** Tipo de categoria: de entrega (com valor por entrega) ou de despesa (sem valor). */
export type TipoCategoria = Aba;

/**
 * Linha das telas de categorias: a de entrega tem `valor_unitario`; a de
 * despesa não (spec 009). `Categoria` e `CategoriaDespesa` são atribuíveis a ela.
 */
export type CategoriaLista = CategoriaDespesa & {
  valor_unitario?: number | string;
  /** Só nas categorias de entrega (spec 011). */
  visivel_gerente?: boolean;
};

/**
 * Query keys de categorias. As listas são por dono (`userId`): o gestor vê as
 * categorias do atendente alvo (spec 008).
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

type ListOptions = { incluirInativas?: boolean; enabled?: boolean };

/** Categorias de `userId`. Use `incluirInativas: false` na tela Lançar. */
export function useCategorias(
  userId: string,
  { incluirInativas = false, enabled = true }: ListOptions = {},
) {
  return useQuery<Categoria[], CategoriaError>({
    queryKey: categoriaKeys.list(userId, incluirInativas),
    queryFn: () => listCategorias(userId, { incluirInativas }),
    enabled: enabled && Boolean(userId),
  });
}

/** Categorias de despesa de `userId` (spec 009). */
export function useCategoriasDespesa(
  userId: string,
  { incluirInativas = false, enabled = true }: ListOptions = {},
) {
  return useQuery<CategoriaDespesa[], CategoriaError>({
    queryKey: categoriaDespesaKeys.list(userId, incluirInativas),
    queryFn: () => listCategoriasDespesa(userId, { incluirInativas }),
    enabled: enabled && Boolean(userId),
  });
}

/**
 * Categorias de entrega ou de despesa (mesmas keys de `useCategorias` /
 * `useCategoriasDespesa`, então o cache é compartilhado).
 */
export function useCategoriasDoTipo(
  tipo: TipoCategoria,
  userId: string,
  { incluirInativas = false, enabled = true }: ListOptions = {},
) {
  const despesa = tipo === 'despesas';
  return useQuery<CategoriaLista[], CategoriaError>({
    queryKey: despesa
      ? categoriaDespesaKeys.list(userId, incluirInativas)
      : categoriaKeys.list(userId, incluirInativas),
    queryFn: () =>
      despesa
        ? listCategoriasDespesa(userId, { incluirInativas })
        : listCategorias(userId, { incluirInativas }),
    enabled: enabled && Boolean(userId),
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

/** Nomes de todas as categorias de despesa visíveis (filtro "Despesas" da Equipe). */
export function useNomesCategoriasDespesa({ enabled = true }: { enabled?: boolean } = {}) {
  return useQuery<string[], CategoriaError>({
    queryKey: categoriaDespesaKeys.nomes(),
    queryFn: listNomesCategoriasDespesa,
    enabled,
  });
}

/**
 * Invalida as listas do dono afetado e os nomes (filtro da Equipe). Para
 * despesa, também as despesas do dono (o nome da categoria aparece na lista do dia).
 */
function useInvalidateCategorias(tipo: TipoCategoria) {
  const queryClient = useQueryClient();
  return (userId: string) =>
    tipo === 'despesas'
      ? Promise.all([
          queryClient.invalidateQueries({ queryKey: categoriaDespesaKeys.user(userId) }),
          queryClient.invalidateQueries({ queryKey: categoriaDespesaKeys.nomes() }),
          queryClient.invalidateQueries({ queryKey: despesaKeys.user(userId) }),
        ])
      : Promise.all([
          queryClient.invalidateQueries({ queryKey: categoriaKeys.user(userId) }),
          queryClient.invalidateQueries({ queryKey: categoriaKeys.nomes() }),
        ]);
}

/** Nova categoria. `valor_unitario` é obrigatório para entrega e ignorado para despesa. */
export type NovaCategoriaVars = {
  user_id: string;
  nome: string;
  ativa?: boolean;
  valor_unitario?: number;
  /** Só entregas, só o dono (spec 011). Omitido quando o gerente cria para o atendente. */
  visivel_gerente?: boolean;
};
export type CategoriaListaPatch = {
  nome?: string;
  ativa?: boolean;
  valor_unitario?: number;
  visivel_gerente?: boolean;
};

function semValor(): CategoriaError {
  return new CategoriaError('invalido', CATEGORIA_ERROR_MESSAGES.invalido);
}

export function useCreateCategoria(tipo: TipoCategoria = 'entregas') {
  const invalidate = useInvalidateCategorias(tipo);
  return useMutation<CategoriaLista, CategoriaError, NovaCategoriaVars>({
    mutationFn: async ({ user_id, nome, ativa, valor_unitario, visivel_gerente }) => {
      if (tipo === 'despesas') return createCategoriaDespesa({ user_id, nome, ativa });
      if (valor_unitario === undefined) throw semValor();
      return createCategoria({ user_id, nome, ativa, valor_unitario, visivel_gerente });
    },
    onSettled: (_res, _err, vars) => invalidate(vars.user_id),
  });
}

export type UpdateCategoriaVars = { id: string; userId: string; patch: CategoriaListaPatch };

export function useUpdateCategoria(tipo: TipoCategoria = 'entregas') {
  const invalidate = useInvalidateCategorias(tipo);
  return useMutation<CategoriaLista, CategoriaError, UpdateCategoriaVars>({
    mutationFn: ({ id, patch }) =>
      tipo === 'despesas'
        ? updateCategoriaDespesa(id, { nome: patch.nome, ativa: patch.ativa })
        : updateCategoria(id, patch),
    onSettled: (_res, _err, vars) => invalidate(vars.userId),
  });
}

export type DeleteCategoriaVars = { id: string; userId: string };

export function useDeleteCategoria(tipo: TipoCategoria = 'entregas') {
  const invalidate = useInvalidateCategorias(tipo);
  return useMutation<void, CategoriaError, DeleteCategoriaVars>({
    mutationFn: ({ id }) =>
      tipo === 'despesas' ? deleteCategoriaDespesa(id) : deleteCategoria(id),
    onSettled: (_res, _err, vars) => invalidate(vars.userId),
  });
}

export type ToggleVisibilidadeVars = { id: string; userId: string; visivel: boolean };
type ListasSnapshot = Array<[readonly unknown[], Categoria[] | undefined]>;

/**
 * Liga/desliga "Visível para <gerente>" de uma categoria (spec 011), com
 * atualização otimista das listas do dono e rollback se o servidor recusar.
 */
export function useToggleVisibilidade() {
  const queryClient = useQueryClient();
  return useMutation<
    CategoriaLista,
    CategoriaError,
    ToggleVisibilidadeVars,
    { antes: ListasSnapshot }
  >({
    mutationFn: ({ id, visivel }) => updateCategoria(id, { visivel_gerente: visivel }),
    onMutate: async ({ id, userId, visivel }) => {
      await queryClient.cancelQueries({ queryKey: categoriaKeys.user(userId) });
      const antes = queryClient.getQueriesData<Categoria[]>({
        queryKey: categoriaKeys.user(userId),
      });
      queryClient.setQueriesData<Categoria[]>({ queryKey: categoriaKeys.user(userId) }, (lista) =>
        lista?.map((c) => (c.id === id ? { ...c, visivel_gerente: visivel } : c)),
      );
      return { antes };
    },
    onError: (_err, _vars, ctx) => {
      ctx?.antes.forEach(([key, data]) => queryClient.setQueryData(key, data));
    },
    onSettled: (_res, _err, vars) =>
      queryClient.invalidateQueries({ queryKey: categoriaKeys.user(vars.userId) }),
  });
}

export type VisibilidadeTodasVars = { userId: string; visivel: boolean };

/** "Mostrar todas" / "Ocultar todas" ao gerente (spec 011): update em lote das categorias do dono. */
export function useSetVisibilidadeTodas() {
  const queryClient = useQueryClient();
  return useMutation<void, CategoriaError, VisibilidadeTodasVars>({
    mutationFn: ({ userId, visivel }) => setVisibilidadeTodas(userId, visivel),
    onSettled: (_res, _err, vars) =>
      queryClient.invalidateQueries({ queryKey: categoriaKeys.user(vars.userId) }),
  });
}
