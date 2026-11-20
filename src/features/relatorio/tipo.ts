/**
 * Tipo do relatório e da Equipe (spec 009): `?tipo=receitas|despesas|ambos`,
 * padrão receitas (que não aparece na URL). Funções puras.
 */
import type { SegmentedOption } from '@/components/ui';

export type TipoRelatorio = 'receitas' | 'despesas' | 'ambos';

export const TIPO_PARAM = 'tipo';
export const TIPO_PADRAO: TipoRelatorio = 'receitas';

export const TIPOS: readonly SegmentedOption<TipoRelatorio>[] = [
  { value: 'receitas', label: 'Receitas' },
  { value: 'despesas', label: 'Despesas' },
  { value: 'ambos', label: 'Ambos' },
];

export function tipoFromSearchParams(params: URLSearchParams): TipoRelatorio {
  const raw = params.get(TIPO_PARAM);
  return raw === 'despesas' || raw === 'ambos' ? raw : TIPO_PADRAO;
}

/** Cópia de `params` com o tipo (o padrão remove o parâmetro). */
export function withTipo(params: URLSearchParams, tipo: TipoRelatorio): URLSearchParams {
  const next = new URLSearchParams(params);
  if (tipo === TIPO_PADRAO) next.delete(TIPO_PARAM);
  else next.set(TIPO_PARAM, tipo);
  return next;
}

/** O tipo mostra receitas (entregas)? */
export const mostraReceitas = (tipo: TipoRelatorio) => tipo !== 'despesas';
/** O tipo mostra despesas? */
export const mostraDespesas = (tipo: TipoRelatorio) => tipo !== 'receitas';
