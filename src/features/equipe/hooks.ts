import { useCallback, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useSearchParams } from 'react-router-dom';
import { listProfiles } from '@/features/admin/api';
import { adminKeys } from '@/features/admin/hooks';
import {
  useNomesCategorias,
  useNomesCategoriasDespesa,
  type TipoCategoria,
} from '@/features/categorias/hooks';
import type { FiltroCategorias } from '@/features/relatorio/api';
import type { RelatorioError } from '@/features/relatorio/errors';
import { resumoKeys, useWriteSearchParams } from '@/features/relatorio/hooks';
import { resolverSelecao } from '@/features/relatorio/filtroCategorias';
import {
  fetchResumoEquipe,
  fetchResumoEquipeDespesas,
  type Perfil,
  type ResumoEquipe,
} from './api';
import {
  DNOMES_PARAM,
  NOMES_PARAM,
  agruparNomes,
  nomesFromSearchParams,
  pedeNenhumNome,
  withNomes,
} from './nomes';

/**
 * Perfis (todos, por nome) para o seletor de entregador e a Equipe. Mesma query
 * da tela de admin (`adminKeys.users()`), que já é invalidada pelas mutations de usuário.
 */
export function usePerfis({ enabled = true }: { enabled?: boolean } = {}) {
  return useQuery<Perfil[], Error>({
    queryKey: adminKeys.users(),
    queryFn: listProfiles,
    enabled,
    staleTime: 60_000,
  });
}

/**
 * Resumo por entregador. A key fica sob `['resumo']`, então as mutations de
 * lançamento (que invalidam esse prefixo) também atualizam a Equipe.
 */
export function useResumoEquipe(
  de: string,
  ate: string,
  nomes: FiltroCategorias,
  { enabled = true }: { enabled?: boolean } = {},
) {
  return useQuery<ResumoEquipe, RelatorioError>({
    queryKey: resumoKeys.equipe(de, ate, nomes),
    queryFn: () => fetchResumoEquipe(de, ate, nomes),
    enabled,
  });
}

/** Despesas por entregador (spec 009). Key sob `['resumo']`, invalidada pelas despesas. */
export function useResumoEquipeDespesas(
  de: string,
  ate: string,
  nomes: FiltroCategorias,
  { enabled = true }: { enabled?: boolean } = {},
) {
  return useQuery<ResumoEquipe, RelatorioError>({
    queryKey: resumoKeys.equipeDespesas(de, ate, nomes),
    queryFn: () => fetchResumoEquipeDespesas(de, ate, nomes),
    enabled,
  });
}

export type UseNomesFiltroOptions = {
  /** `entregas` usa `?nomes=`; `despesas` usa `?dnomes=` (spec 009). */
  tipo?: TipoCategoria;
  /** Seção visível no tipo atual? Desligada, não consulta nada e vale "todas". */
  enabled?: boolean;
};

/**
 * Filtro por nome de categoria sincronizado com `?nomes=a&nomes=b` (ou `dnomes`),
 * com chaves normalizadas.
 * - `opcoes`: união dos nomes de todas as categorias, agrupados sem diferenciar maiúsculas;
 * - `selecionadas`: `null` = todas; `[]` = nenhuma; chaves desconhecidas são ignoradas;
 * - `pronto`: com o parâmetro na URL, espera a lista para validar antes de consultar;
 * - `paramsCom`: aplica uma seleção numa cópia dos parâmetros (gravar os dois filtros juntos).
 */
export function useNomesFiltro({ tipo = 'entregas', enabled = true }: UseNomesFiltroOptions = {}) {
  const [searchParams] = useSearchParams();
  const write = useWriteSearchParams();
  const despesa = tipo === 'despesas';
  const param = despesa ? DNOMES_PARAM : NOMES_PARAM;
  const queryEntregas = useNomesCategorias({ enabled: enabled && !despesa });
  const queryDespesas = useNomesCategoriasDespesa({ enabled: enabled && despesa });
  const query = despesa ? queryDespesas : queryEntregas;
  const opcoes = useMemo(
    () => (enabled ? agruparNomes(query.data ?? []) : []),
    [enabled, query.data],
  );
  const chaves = useMemo(() => opcoes.map((o) => o.id), [opcoes]);
  const chavesUrl = useMemo(
    () => nomesFromSearchParams(searchParams, param),
    [searchParams, param],
  );
  const nenhum = pedeNenhumNome(searchParams, param);

  const selecionadas = useMemo<FiltroCategorias>(() => {
    if (!enabled) return null;
    if (nenhum) return [];
    return query.data ? resolverSelecao(chavesUrl, chaves) : null;
  }, [enabled, nenhum, query.data, chavesUrl, chaves]);
  const pronto = !enabled || nenhum || chavesUrl.length === 0 || !query.isPending;

  const paramsCom = useCallback(
    (params: URLSearchParams, next: readonly string[] | null) =>
      withNomes(params, next, chaves, param),
    [chaves, param],
  );
  const aplicar = useCallback(
    (next: readonly string[] | null) => write(paramsCom(searchParams, next)),
    [searchParams, write, paramsCom],
  );
  const limpar = useCallback(() => aplicar(null), [aplicar]);

  return { opcoes, selecionadas, pronto, aplicar, limpar, paramsCom };
}
