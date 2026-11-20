import {
  LANCAMENTO_ERROR_MESSAGES,
  LancamentoError,
  toLancamentoError,
  type LancamentoErrorKind,
} from '@/features/lancamentos/errors';

export const DESPESA_ERROR_MESSAGES = {
  dataFutura: LANCAMENTO_ERROR_MESSAGES.dataFutura,
  categoriaInvalida: 'Categoria de despesa não encontrada. Atualize a tela e tente de novo.',
  categoriaInativa: 'Esta categoria de despesa foi desativada. Atualize a tela e tente de novo.',
  invalido: 'Valor ou descrição inválidos.',
  carregar: 'Não foi possível carregar as despesas.',
  salvar: LANCAMENTO_ERROR_MESSAGES.salvar,
  excluir: LANCAMENTO_ERROR_MESSAGES.excluir,
} as const;

/** Mesmo formato do erro de lançamento (mesmos `kind`s), com mensagens de despesa. */
export type DespesaError = LancamentoError;

const MENSAGENS: Record<Exclude<LancamentoErrorKind, 'desconhecido'>, string> = {
  data_futura: DESPESA_ERROR_MESSAGES.dataFutura,
  categoria_invalida: DESPESA_ERROR_MESSAGES.categoriaInvalida,
  categoria_inativa: DESPESA_ERROR_MESSAGES.categoriaInativa,
  invalido: DESPESA_ERROR_MESSAGES.invalido,
};

/**
 * Traduz erros de `despesas` (mesmas regras de `toLancamentoError`):
 * 23514 data futura / categoria inativa / checks (valor ≤ 0, descrição longa),
 * 23502 valor nulo, 23503 categoria de outro usuário ou inexistente.
 */
export function toDespesaError(err: unknown, fallback: string): DespesaError {
  const base = toLancamentoError(err, fallback);
  if (base.kind === 'desconhecido') return base;
  return new LancamentoError(base.kind, MENSAGENS[base.kind], base.code);
}
