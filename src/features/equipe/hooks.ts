import { useCallback, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useSearchParams } from 'react-router-dom';
import { listProfiles } from '@/features/admin/api';
import { adminKeys } from '@/features/admin/hooks';
import { useNomesCategorias } from '@/features/categorias/hooks';
import type { FiltroCategorias } from '@/features/relatorio/api';
import type { RelatorioError } from '@/features/relatorio/errors';
import { resumoKeys, useWriteSearchParams } from '@/features/relatorio/hooks';
import { fetchResumoEquipe, type Perfil, type ResumoEquipe } from './api';
import { agruparNomes, nomesFromSearchParams, withNomes } from './nomes';
import { resolverSelecao } from '@/features/relatorio/filtroCategorias';

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

/**
 * Filtro por nome de categoria sincronizado com `?nomes=a&nomes=b` (chaves normalizadas).
 * - `opcoes`: união dos nomes de todas as categorias, agrupados sem diferenciar maiúsculas;
 * - `selecionadas`: `null` = todas; chaves desconhecidas são ignoradas;
 * - `pronto`: com `nomes` na URL, espera a lista para validar antes de consultar.
 */
export function useNomesFiltro() {
  const [searchParams] = useSearchParams();
  const write = useWriteSearchParams();
  const query = useNomesCategorias();
  const opcoes = useMemo(() => agruparNomes(query.data ?? []), [query.data]);
  const chaves = useMemo(() => opcoes.map((o) => o.id), [opcoes]);
  const chavesUrl = useMemo(() => nomesFromSearchParams(searchParams), [searchParams]);

  const selecionadas = useMemo<FiltroCategorias>(
    () => (query.data ? resolverSelecao(chavesUrl, chaves) : null),
    [query.data, chavesUrl, chaves],
  );
  const pronto = chavesUrl.length === 0 || !query.isPending;

  const aplicar = useCallback(
    (next: readonly string[] | null) => write(withNomes(searchParams, next, chaves)),
    [searchParams, write, chaves],
  );
  const limpar = useCallback(() => aplicar(null), [aplicar]);

  return { opcoes, selecionadas, pronto, aplicar, limpar };
}
