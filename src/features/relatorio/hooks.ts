import { useCallback, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useCategorias } from '@/features/categorias/hooks';
import { hojeISO } from '@/lib/format';
import { fetchResumo, type FiltroCategorias, type Resumo } from './api';
import type { RelatorioError } from './errors';
import {
  CATS_PARAM,
  catsFromSearchParams,
  catsQueryKey,
  resolverSelecao,
  toSearchString,
  withCats,
} from './filtroCategorias';
import {
  periodoFromSearchParams,
  periodoRapido,
  periodoToSearchParams,
  type Intervalo,
  type Periodo,
  type PeriodoRapido,
} from './periodos';

/**
 * Query keys do relatório. A tela Lançar invalida o prefixo `resumoKeys.all`
 * (`['resumo']`) após criar/editar/excluir lançamentos.
 * A última parte é o filtro de categorias: IDs ordenados ou `'todas'`.
 */
export const resumoKeys = {
  all: ['resumo'] as const,
  periodo: (de: string, ate: string, categorias: FiltroCategorias = null) =>
    [...resumoKeys.all, de, ate, catsQueryKey(categorias)] as const,
};

/**
 * Resumo por categoria e por dia do período (as duas RPCs em paralelo).
 * `categorias`: `null` = todas; um array = só essas.
 */
export function useResumo(
  de: string,
  ate: string,
  categorias: FiltroCategorias = null,
  { enabled = true }: { enabled?: boolean } = {},
) {
  return useQuery<Resumo, RelatorioError>({
    queryKey: resumoKeys.periodo(de, ate, categorias),
    queryFn: () => fetchResumo(de, ate, categorias),
    enabled,
  });
}

/** Troca a query string da rota atual (replace), mantendo as vírgulas de `cats` legíveis. */
function useWriteSearchParams() {
  const navigate = useNavigate();
  return useCallback(
    (params: URLSearchParams) => navigate({ search: toSearchString(params) }, { replace: true }),
    [navigate],
  );
}

/**
 * Filtro de período sincronizado com a query string
 * (`?periodo=mes` ou `?de=2026-11-01&ate=2026-11-30`), para sobreviver ao reload.
 * Preserva o filtro de categorias (`cats`).
 */
export function usePeriodoFiltro() {
  const [searchParams] = useSearchParams();
  const write = useWriteSearchParams();
  const hoje = hojeISO();
  const periodo = useMemo(() => periodoFromSearchParams(searchParams, hoje), [searchParams, hoje]);

  const setPeriodo = useCallback(
    (next: Periodo) => {
      const params = periodoToSearchParams(next);
      const cats = searchParams.get(CATS_PARAM);
      if (cats) params.set(CATS_PARAM, cats);
      write(params);
    },
    [searchParams, write],
  );
  const escolherRapido = useCallback(
    (tipo: PeriodoRapido) => setPeriodo(periodoRapido(tipo, hojeISO())),
    [setPeriodo],
  );
  const escolherPersonalizado = useCallback(
    (intervalo: Intervalo) => setPeriodo({ tipo: 'personalizado', ...intervalo }),
    [setPeriodo],
  );

  return { periodo, hoje, escolherRapido, escolherPersonalizado };
}

/**
 * Filtro de categorias sincronizado com `?cats=id1,id2`.
 * - `categorias`: todas as do usuário (ativas primeiro, depois inativas, por nome);
 * - `selecionadas`: `null` = todas; IDs desconhecidos da URL são ignorados;
 * - `pronto`: com `cats` na URL, espera a lista de categorias para validar os IDs
 *   antes de consultar o resumo (sem `cats`, já está pronto).
 */
export function useCategoriasFiltro() {
  const [searchParams] = useSearchParams();
  const write = useWriteSearchParams();
  const query = useCategorias({ incluirInativas: true });
  const categorias = useMemo(() => query.data ?? [], [query.data]);
  const ids = useMemo(() => categorias.map((c) => c.id), [categorias]);
  const idsUrl = useMemo(() => catsFromSearchParams(searchParams), [searchParams]);

  // Sem a lista (carregando ou erro) não dá para validar os IDs: vale "todas".
  const selecionadas = useMemo<FiltroCategorias>(
    () => (query.data ? resolverSelecao(idsUrl, ids) : null),
    [query.data, idsUrl, ids],
  );
  const pronto = idsUrl.length === 0 || !query.isPending;

  /** Grava a seleção na URL. Todas marcadas (ou `null`) remove `cats`. */
  const aplicar = useCallback(
    (next: readonly string[] | null) => write(withCats(searchParams, next, ids)),
    [searchParams, write, ids],
  );
  const limpar = useCallback(() => aplicar(null), [aplicar]);

  return { categorias, selecionadas, pronto, aplicar, limpar };
}
