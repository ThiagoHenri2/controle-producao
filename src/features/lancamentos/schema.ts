import { z } from 'zod';
import { toCentavos } from '@/lib/format';
import type { LancamentoPatch, NovoLancamentoItem } from './api';

export const QUANTIDADE_MAX = 9999;
export const OBSERVACAO_MAX = 200;

export const LANCAMENTO_FORM_MESSAGES = {
  quantidadeVazia: 'Informe a quantidade.',
  quantidadeInvalida: 'Use um número inteiro.',
  quantidadeMin: 'A quantidade mínima é 1.',
  quantidadeMax: `A quantidade máxima é ${QUANTIDADE_MAX}.`,
  observacaoLonga: `Use no máximo ${OBSERVACAO_MAX} caracteres.`,
} as const;

/** Quantidades digitadas na tela Lançar, por `categoria_id`. */
export type Quantidades = Readonly<Record<string, number>>;

type CategoriaPreco = { id: string; valor_unitario: number | string };

const quantidadeSchema = z
  .number({ error: LANCAMENTO_FORM_MESSAGES.quantidadeInvalida })
  .int(LANCAMENTO_FORM_MESSAGES.quantidadeInvalida)
  .min(1, LANCAMENTO_FORM_MESSAGES.quantidadeMin)
  .max(QUANTIDADE_MAX, LANCAMENTO_FORM_MESSAGES.quantidadeMax);

const itemSchema = z.object({ categoria_id: z.string().min(1), quantidade: quantidadeSchema });

/**
 * Itens do envio em lote: só categorias da lista (ativas) com quantidade ≥ 1.
 * Quantidade 0/vazia é ignorada. Nunca inclui `valor_unitario`.
 */
export function montarItens(
  categorias: ReadonlyArray<CategoriaPreco>,
  quantidades: Quantidades,
): NovoLancamentoItem[] {
  const itens = categorias
    .map((c) => ({ categoria_id: c.id, quantidade: quantidades[c.id] ?? 0 }))
    .filter((i) => i.quantidade > 0);
  return z.array(itemSchema).parse(itens);
}

/** Subtotal ao vivo em centavos inteiros: Σ quantidade × centavos(valor_unitario). */
export function subtotalCentavos(
  categorias: ReadonlyArray<CategoriaPreco>,
  quantidades: Quantidades,
): number {
  return categorias.reduce(
    (acc, c) => acc + (quantidades[c.id] ?? 0) * toCentavos(c.valor_unitario),
    0,
  );
}

/** Soma de `valor_total` (calculado pelo banco) em centavos inteiros. */
export function totalCentavos(rows: ReadonlyArray<{ valor_total: number | string }>): number {
  return rows.reduce((acc, r) => acc + toCentavos(r.valor_total), 0);
}

export const editarLancamentoSchema = z.object({
  quantidade: z
    .string()
    .trim()
    .min(1, LANCAMENTO_FORM_MESSAGES.quantidadeVazia)
    .regex(/^\d+$/, LANCAMENTO_FORM_MESSAGES.quantidadeInvalida)
    .transform(Number)
    .pipe(quantidadeSchema),
  observacao: z
    .string()
    .trim()
    .max(OBSERVACAO_MAX, LANCAMENTO_FORM_MESSAGES.observacaoLonga)
    .transform((s) => (s === '' ? null : s)),
});

export type EditarLancamentoInput = z.input<typeof editarLancamentoSchema>;
export type EditarLancamentoErrors = Partial<Record<'quantidade' | 'observacao', string>>;

export type ValidarEdicaoResult =
  { ok: true; patch: LancamentoPatch } | { ok: false; errors: EditarLancamentoErrors };

export function validarEdicao(input: EditarLancamentoInput): ValidarEdicaoResult {
  const parsed = editarLancamentoSchema.safeParse(input);
  if (parsed.success) return { ok: true, patch: parsed.data };
  const errors: EditarLancamentoErrors = {};
  for (const issue of parsed.error.issues) {
    const field = issue.path[0];
    if ((field === 'quantidade' || field === 'observacao') && !errors[field]) {
      errors[field] = issue.message;
    }
  }
  return { ok: false, errors };
}
