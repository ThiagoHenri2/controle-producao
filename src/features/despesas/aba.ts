import { useCallback } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Receipt, Truck } from 'lucide-react';
import type { TabItem } from '@/components/ui';
import { toSearchString } from '@/features/relatorio/filtroCategorias';

/** Aba das telas Lançar e Categorias (spec 009). */
export type Aba = 'entregas' | 'despesas';

/** `?aba=entregas|despesas` (padrão entregas, que não aparece na URL). */
export const ABA_PARAM = 'aba';
export const ABA_PADRAO: Aba = 'entregas';

export const ABAS: readonly TabItem<Aba>[] = [
  { value: 'entregas', label: 'Entregas', icon: Truck },
  { value: 'despesas', label: 'Despesas', icon: Receipt },
];

export function abaFromSearchParams(params: URLSearchParams): Aba {
  return params.get(ABA_PARAM) === 'despesas' ? 'despesas' : ABA_PADRAO;
}

/** Cópia de `params` com a aba (a padrão remove o parâmetro). Preserva `usuario` etc. */
export function withAba(params: URLSearchParams, aba: Aba): URLSearchParams {
  const next = new URLSearchParams(params);
  if (aba === ABA_PADRAO) next.delete(ABA_PARAM);
  else next.set(ABA_PARAM, aba);
  return next;
}

/**
 * Query string para levar o alvo (`?usuario=`) e a aba a outra tela.
 * `alvoSearch` é o `UsuarioAlvo.search` ('' ou `?usuario=<id>`).
 */
export function searchComAba(alvoSearch: string, aba: Aba): string {
  return toSearchString(withAba(new URLSearchParams(alvoSearch), aba));
}

/** Aba atual, lida da URL; trocar faz `replace` preservando os outros parâmetros. */
export function useAba() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const aba = abaFromSearchParams(searchParams);
  const setAba = useCallback(
    (next: Aba) =>
      navigate({ search: toSearchString(withAba(searchParams, next)) }, { replace: true }),
    [navigate, searchParams],
  );
  return [aba, setAba] as const;
}
