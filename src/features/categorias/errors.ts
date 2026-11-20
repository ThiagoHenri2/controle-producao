export const CATEGORIA_ERROR_MESSAGES = {
  duplicado: 'Já existe uma categoria com esse nome.',
  emUso: 'Esta categoria já tem lançamentos. Desative-a em vez de excluir.',
  emUsoInativa:
    'Esta categoria já tem lançamentos e não pode ser excluída. Ela continua desativada.',
  invalido: 'Nome ou valor inválido.',
  carregar: 'Não foi possível carregar as categorias.',
  salvar: 'Não foi possível salvar. Verifique sua conexão e tente de novo.',
  excluir: 'Não foi possível excluir. Verifique sua conexão e tente de novo.',
} as const;

export type CategoriaErrorKind = 'duplicado' | 'em_uso' | 'invalido' | 'desconhecido';

/** Erro de categoria com mensagem pronta para o usuário (nunca o texto técnico do banco). */
export class CategoriaError extends Error {
  readonly kind: CategoriaErrorKind;
  readonly code?: string;

  constructor(kind: CategoriaErrorKind, message: string, code?: string) {
    super(message);
    this.name = 'CategoriaError';
    this.kind = kind;
    this.code = code;
  }
}

function errorCode(err: unknown): string | undefined {
  if (typeof err === 'object' && err !== null && 'code' in err) {
    const { code } = err as { code: unknown };
    return typeof code === 'string' ? code : undefined;
  }
  return undefined;
}

/**
 * Traduz erros do Postgres/PostgREST:
 * - 23505 (unique) → nome duplicado
 * - 23503 (FK `no action`) e 23001 (FK `restrict`, caso de `lancamentos.categoria_id`)
 *   → categoria em uso
 * - 23514 (check) → nome/valor inválido
 */
export function toCategoriaError(err: unknown, fallback: string): CategoriaError {
  if (err instanceof CategoriaError) return err;
  const code = errorCode(err);
  switch (code) {
    case '23505':
      return new CategoriaError('duplicado', CATEGORIA_ERROR_MESSAGES.duplicado, code);
    case '23503':
    case '23001':
      return new CategoriaError('em_uso', CATEGORIA_ERROR_MESSAGES.emUso, code);
    case '23514':
      return new CategoriaError('invalido', CATEGORIA_ERROR_MESSAGES.invalido, code);
    default:
      return new CategoriaError('desconhecido', fallback, code);
  }
}

/** Mensagem amigável para qualquer erro vindo dos hooks de categorias. */
export function categoriaErrorMessage(err: unknown, fallback: string): string {
  return toCategoriaError(err, fallback).message;
}
