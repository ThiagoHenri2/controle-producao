import { z } from 'zod';
import { parseValorBRL } from '@/features/categorias/schema';
import { fromCentavos } from '@/lib/format';
import type { DespesaPatch } from './api';

export const DESCRICAO_MAX = 200;

export const DESPESA_FORM_MESSAGES = {
  categoriaVazia: 'Escolha a categoria.',
  valorZero: 'Informe um valor maior que zero.',
  descricaoLonga: `Use no máximo ${DESCRICAO_MAX} caracteres.`,
} as const;

/** Valor digitado ("35,90", "35.90", "R$ 35,90") → centavos > 0 (parser BRL das categorias). */
const valorSchema = z.string().transform((raw, ctx) => {
  const r = parseValorBRL(raw);
  if (!r.ok) {
    ctx.addIssue({ code: 'custom', message: r.error });
    return z.NEVER;
  }
  if (r.centavos <= 0) {
    ctx.addIssue({ code: 'custom', message: DESPESA_FORM_MESSAGES.valorZero });
    return z.NEVER;
  }
  return r.centavos;
});

export const despesaFormSchema = z.object({
  categoria_despesa_id: z.string().min(1, DESPESA_FORM_MESSAGES.categoriaVazia),
  valor: valorSchema,
  descricao: z
    .string()
    .trim()
    .max(DESCRICAO_MAX, DESPESA_FORM_MESSAGES.descricaoLonga)
    .transform((s) => (s === '' ? null : s)),
});

export type DespesaFormInput = z.input<typeof despesaFormSchema>;
type Campo = keyof DespesaFormInput;
export type DespesaFormErrors = Partial<Record<Campo, string>>;

/** Payload pronto para o banco + o valor em centavos (para o toast). */
export type DespesaValidada = DespesaPatch & { centavos: number };

export type ValidarDespesaResult =
  { ok: true; despesa: DespesaValidada } | { ok: false; errors: DespesaFormErrors };

const CAMPOS: readonly Campo[] = ['categoria_despesa_id', 'valor', 'descricao'];

export function validarDespesa(input: DespesaFormInput): ValidarDespesaResult {
  const parsed = despesaFormSchema.safeParse(input);
  if (parsed.success) {
    const { categoria_despesa_id, valor, descricao } = parsed.data;
    return {
      ok: true,
      despesa: { categoria_despesa_id, valor: fromCentavos(valor), descricao, centavos: valor },
    };
  }
  const errors: DespesaFormErrors = {};
  for (const issue of parsed.error.issues) {
    const field = CAMPOS.find((c) => c === issue.path[0]);
    if (field && !errors[field]) errors[field] = issue.message;
  }
  return { ok: false, errors };
}
