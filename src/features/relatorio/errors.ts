export const RELATORIO_ERROR_MESSAGES = {
  carregar: 'Não foi possível carregar o relatório.',
  periodoInvalido: 'Período inválido. Escolha no máximo 366 dias, com o início antes do fim.',
} as const;

export type RelatorioErrorKind = 'periodo_invalido' | 'desconhecido';

/** Erro do relatório com mensagem pronta para o usuário. */
export class RelatorioError extends Error {
  readonly kind: RelatorioErrorKind;
  readonly code?: string;

  constructor(kind: RelatorioErrorKind, message: string, code?: string) {
    super(message);
    this.name = 'RelatorioError';
    this.kind = kind;
    this.code = code;
  }
}

function field(err: unknown, name: 'code' | 'message'): string | undefined {
  if (typeof err === 'object' && err !== null && name in err) {
    const value = (err as Record<string, unknown>)[name];
    return typeof value === 'string' ? value : undefined;
  }
  return undefined;
}

/**
 * Traduz erros das RPCs de resumo:
 * - 22023 (invalid_parameter_value) → período inválido. A RPC já manda a
 *   mensagem em pt-BR; usamos a nossa se vier vazia.
 * - qualquer outro → mensagem genérica de carregamento.
 */
export function toRelatorioError(err: unknown): RelatorioError {
  if (err instanceof RelatorioError) return err;
  const code = field(err, 'code');
  if (code === '22023') {
    const message = field(err, 'message')?.trim() || RELATORIO_ERROR_MESSAGES.periodoInvalido;
    return new RelatorioError('periodo_invalido', message, code);
  }
  return new RelatorioError('desconhecido', RELATORIO_ERROR_MESSAGES.carregar, code);
}
