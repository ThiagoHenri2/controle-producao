/**
 * Query keys de despesas (spec 009). Ficam num módulo sem dependências para
 * serem usadas também pelos hooks de categorias (sem import circular).
 */
export const despesaKeys = {
  all: ['despesas'] as const,
  /** Tudo de um dono (o próprio usuário ou o entregador alvo do gestor). */
  user: (userId: string) => [...despesaKeys.all, userId] as const,
  dia: (userId: string, data: string) => [...despesaKeys.user(userId), data] as const,
};

/** Categorias de despesa: listas por dono e nomes (filtro da Equipe). */
export const categoriaDespesaKeys = {
  all: ['categorias_despesa'] as const,
  lists: () => [...categoriaDespesaKeys.all, 'list'] as const,
  user: (userId: string) => [...categoriaDespesaKeys.lists(), userId] as const,
  list: (userId: string, incluirInativas: boolean) =>
    [...categoriaDespesaKeys.user(userId), { incluirInativas }] as const,
  nomes: () => [...categoriaDespesaKeys.all, 'nomes'] as const,
};
