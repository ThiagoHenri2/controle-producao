export const LANCAMENTO_ERROR_MESSAGES = {
  dataFutura: 'Não dá para lançar em data futura. Escolha hoje ou um dia anterior.',
  categoriaInvalida: 'Categoria não encontrada. Atualize a tela e tente de novo.',
  categoriaInativa: 'Uma das categorias foi desativada. Atualize a tela e tente de novo.',
  invalido: 'Quantidade ou observação inválida.',
  carregar: 'Não foi possível carregar os lançamentos.',
  salvar: 'Não foi possível salvar. Verifique sua conexão e tente de novo.',
  excluir: 'Não foi possível excluir. Verifique sua conexão e tente de novo.',
} as const;

export type LancamentoErrorKind =
  'data_futura' | 'categoria_invalida' | 'categoria_inativa' | 'invalido' | 'desconhecido';

/** Erro de lançamento com mensagem pronta para o usuário (nunca o texto técnico do banco). */
export class LancamentoError extends Error {
  readonly kind: LancamentoErrorKind;
  readonly code?: string;

  constructor(kind: LancamentoErrorKind, message: string, code?: string) {
    super(message);
    this.name = 'LancamentoError';
    this.kind = kind;
    this.code = code;
  }
}

function campo(err: unknown, key: 'code' | 'message' | 'details'): string {
  if (typeof err === 'object' && err !== null && key in err) {
    const value = (err as Record<string, unknown>)[key];
    return typeof value === 'string' ? value : '';
  }
  return '';
}

/**
 * Traduz erros do Postgres/PostgREST em `lancamentos`:
 * - 23514 + constraint `lancamentos_data_nao_futura` → data futura
 * - 23514 vindo do trigger ("Categoria inativa…") → categoria inativa
 * - 23514 (outros checks: quantidade > 0, observação ≤ 200) → inválido
 * - 23503 (trigger/FK: categoria inexistente ou de outro usuário) → categoria inválida
 */
export function toLancamentoError(err: unknown, fallback: string): LancamentoError {
  if (err instanceof LancamentoError) return err;
  const code = campo(err, 'code') || undefined;
  const texto = `${campo(err, 'message')} ${campo(err, 'details')}`;
  switch (code) {
    case '23514':
      if (texto.includes('lancamentos_data_nao_futura')) {
        return new LancamentoError('data_futura', LANCAMENTO_ERROR_MESSAGES.dataFutura, code);
      }
      if (/categoria inativa/i.test(texto)) {
        return new LancamentoError(
          'categoria_inativa',
          LANCAMENTO_ERROR_MESSAGES.categoriaInativa,
          code,
        );
      }
      return new LancamentoError('invalido', LANCAMENTO_ERROR_MESSAGES.invalido, code);
    case '23503':
      return new LancamentoError(
        'categoria_invalida',
        LANCAMENTO_ERROR_MESSAGES.categoriaInvalida,
        code,
      );
    default:
      return new LancamentoError('desconhecido', fallback, code);
  }
}
