import { useCallback, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useCategoriasDoTipo, type TipoCategoria } from '@/features/categorias/hooks';
import { hojeISO } from '@/lib/format';
import {
  fetchResumo,
  fetchResumoDespesas,
  type FiltroCategorias,
  type Resumo,
  type UsuarioResumo,
} from './api';
import type { RelatorioError } from './errors';
import {
  CATS_PARAM,
  DCATS_PARAM,
  catsFromSearchParams,
  catsQueryKey,
  pedeNenhuma,
  resolverSelecao,
  toSearchString,
  withCats,
} from './filtroCategorias';
import { tipoFromSearchParams, withTipo, type TipoRelatorio } from './tipo';
import {
  PERIODO_PARAMS,
  periodoFromSearchParams,
  periodoRapido,
  periodoToSearchParams,
  type Intervalo,
  type Periodo,
  type PeriodoRapido,
} from './periodos';

/**
 * Query keys do relatório. A tela Lançar invalida o prefixo `resumoKeys.all`
 * (`['resumo']`) após criar/editar/excluir lançamentos, o que também cobre a Equipe.
 * - `periodo`: `['resumo', usuarioId, de, ate, cats]` (cats = IDs ordenados ou `'todas'`);
 * - `equipe`: `['resumo', 'equipe', de, ate, nomes]` (spec 008);
 * - `despesas` / `equipeDespesas`: as mesmas, para as despesas (spec 009).
 */
export const resumoKeys = {
  all: ['resumo'] as const,
  periodo: (usuarioId: string, de: string, ate: string, categorias: FiltroCategorias = null) =>
    [...resumoKeys.all, usuarioId, de, ate, catsQueryKey(categorias)] as const,
  despesas: (usuarioId: string, de: string, ate: string, categorias: FiltroCategorias = null) =>
    [...resumoKeys.all, 'despesas', usuarioId, de, ate, catsQueryKey(categorias)] as const,
  equipe: (de: string, ate: string, nomes: FiltroCategorias = null) =>
    [...resumoKeys.all, 'equipe', de, ate, catsQueryKey(nomes)] as const,
  equipeDespesas: (de: string, ate: string, nomes: FiltroCategorias = null) =>
    [...resumoKeys.all, 'equipe-despesas', de, ate, catsQueryKey(nomes)] as const,
};

export type UseResumoOptions = {
  /** Dono do relatório (para a query key); sempre um id, inclusive o próprio. */
  usuarioId: string;
  /** `p_usuario` enviado à RPC: `null` = o próprio (omitido). */
  pUsuario?: UsuarioResumo;
  enabled?: boolean;
};

/**
 * Resumo por categoria e por dia do período (as duas RPCs em paralelo).
 * `categorias`: `null` = todas; um array = só essas.
 */
export function useResumo(
  de: string,
  ate: string,
  categorias: FiltroCategorias,
  { usuarioId, pUsuario = null, enabled = true }: UseResumoOptions,
) {
  return useQuery<Resumo, RelatorioError>({
    queryKey: resumoKeys.periodo(usuarioId, de, ate, categorias),
    queryFn: () => fetchResumo(de, ate, categorias, pUsuario),
    enabled: enabled && Boolean(usuarioId),
  });
}

/** Resumo de despesas por categoria e por dia (spec 009). Mesmas opções de `useResumo`. */
export function useResumoDespesas(
  de: string,
  ate: string,
  categorias: FiltroCategorias,
  { usuarioId, pUsuario = null, enabled = true }: UseResumoOptions,
) {
  return useQuery<Resumo, RelatorioError>({
    queryKey: resumoKeys.despesas(usuarioId, de, ate, categorias),
    queryFn: () => fetchResumoDespesas(de, ate, categorias, pUsuario),
    enabled: enabled && Boolean(usuarioId),
  });
}

/** Troca a query string da rota atual (replace), mantendo as vírgulas de `cats` legíveis. */
export function useWriteSearchParams() {
  const navigate = useNavigate();
  return useCallback(
    (params: URLSearchParams) => navigate({ search: toSearchString(params) }, { replace: true }),
    [navigate],
  );
}

/**
 * Filtro de período sincronizado com a query string
 * (`?periodo=mes` ou `?de=2026-11-01&ate=2026-11-30`), para sobreviver ao reload.
 * Preserva os demais parâmetros (`cats`, `usuario`, `nomes`).
 */
export function usePeriodoFiltro() {
  const [searchParams] = useSearchParams();
  const write = useWriteSearchParams();
  const hoje = hojeISO();
  const periodo = useMemo(() => periodoFromSearchParams(searchParams, hoje), [searchParams, hoje]);

  const setPeriodo = useCallback(
    (next: Periodo) => {
      const params = periodoToSearchParams(next);
      searchParams.forEach((value, key) => {
        if (!(PERIODO_PARAMS as readonly string[]).includes(key)) params.append(key, value);
      });
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

/** Tipo do relatório/Equipe na URL (`?tipo=`, spec 009); trocar preserva os outros parâmetros. */
export function useTipoRelatorio() {
  const [searchParams] = useSearchParams();
  const write = useWriteSearchParams();
  const tipo = tipoFromSearchParams(searchParams);
  const setTipo = useCallback(
    (next: TipoRelatorio) => write(withTipo(searchParams, next)),
    [searchParams, write],
  );
  return [tipo, setTipo] as const;
}

export type UseCategoriasFiltroOptions = {
  /** `entregas` usa `?cats=`; `despesas` usa `?dcats=` (spec 009). */
  tipo?: TipoCategoria;
  /** Seção visível no tipo atual? Desligada, não consulta nada e vale "todas". */
  enabled?: boolean;
};

/**
 * Filtro de categorias de `usuarioId` sincronizado com `?cats=id1,id2` (ou `?dcats=`).
 * - `categorias`: todas as do usuário (ativas primeiro, depois inativas, por nome);
 * - `selecionadas`: `null` = todas; `[]` = nenhuma (`?dcats=nenhuma`); IDs
 *   desconhecidos da URL são ignorados;
 * - `pronto`: com o parâmetro na URL, espera a lista de categorias para validar os
 *   IDs antes de consultar o resumo (sem ele, já está pronto);
 * - `paramsCom`: aplica uma seleção numa cópia dos parâmetros (para gravar os dois
 *   filtros de uma vez).
 */
export function useCategoriasFiltro(
  usuarioId: string,
  { tipo = 'entregas', enabled = true }: UseCategoriasFiltroOptions = {},
) {
  const [searchParams] = useSearchParams();
  const write = useWriteSearchParams();
  const param = tipo === 'despesas' ? DCATS_PARAM : CATS_PARAM;
  const query = useCategoriasDoTipo(tipo, usuarioId, { incluirInativas: true, enabled });
  const categorias = useMemo(() => (enabled ? (query.data ?? []) : []), [enabled, query.data]);
  const ids = useMemo(() => categorias.map((c) => c.id), [categorias]);
  const idsUrl = useMemo(() => catsFromSearchParams(searchParams, param), [searchParams, param]);
  const nenhuma = pedeNenhuma(searchParams, param);

  // Sem a lista (carregando ou erro) não dá para validar os IDs: vale "todas".
  const selecionadas = useMemo<FiltroCategorias>(() => {
    if (!enabled) return null;
    if (nenhuma) return [];
    return query.data ? resolverSelecao(idsUrl, ids) : null;
  }, [enabled, nenhuma, query.data, idsUrl, ids]);
  const pronto = !enabled || nenhuma || idsUrl.length === 0 || !query.isPending;

  const paramsCom = useCallback(
    (params: URLSearchParams, next: readonly string[] | null) => withCats(params, next, ids, param),
    [ids, param],
  );
  /** Grava a seleção na URL. Todas marcadas (ou `null`) remove o parâmetro. */
  const aplicar = useCallback(
    (next: readonly string[] | null) => write(paramsCom(searchParams, next)),
    [searchParams, write, paramsCom],
  );
  const limpar = useCallback(() => aplicar(null), [aplicar]);

  return { categorias, selecionadas, pronto, aplicar, limpar, paramsCom };
}
