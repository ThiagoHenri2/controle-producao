import { useCallback, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useSearchParams } from 'react-router-dom';
import { hojeISO } from '@/lib/format';
import { fetchResumo, type Resumo } from './api';
import type { RelatorioError } from './errors';
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
 */
export const resumoKeys = {
  all: ['resumo'] as const,
  periodo: (de: string, ate: string) => [...resumoKeys.all, de, ate] as const,
};

/** Resumo por categoria e por dia do período (as duas RPCs em paralelo). */
export function useResumo(de: string, ate: string) {
  return useQuery<Resumo, RelatorioError>({
    queryKey: resumoKeys.periodo(de, ate),
    queryFn: () => fetchResumo(de, ate),
  });
}

/**
 * Filtro de período sincronizado com a query string
 * (`?periodo=mes` ou `?de=2026-11-01&ate=2026-11-30`), para sobreviver ao reload.
 */
export function usePeriodoFiltro() {
  const [searchParams, setSearchParams] = useSearchParams();
  const hoje = hojeISO();
  const periodo = useMemo(() => periodoFromSearchParams(searchParams, hoje), [searchParams, hoje]);

  const setPeriodo = useCallback(
    (next: Periodo) => setSearchParams(periodoToSearchParams(next), { replace: true }),
    [setSearchParams],
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
