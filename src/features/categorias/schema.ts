import { z } from 'zod';
import { fromCentavos, toCentavos } from '@/lib/format';

export const NOME_MAX = 60;
/** Limite do `numeric(10,2)` do banco: 99.999.999,99. */
const VALOR_MAX_CENTAVOS = 9_999_999_999;

export const CATEGORIA_FORM_MESSAGES = {
  nomeVazio: 'Informe o nome.',
  nomeLongo: `Use no máximo ${NOME_MAX} caracteres.`,
  nomeDuplicado: 'Já existe uma categoria com esse nome.',
  valorVazio: 'Informe o valor.',
  valorNegativo: 'O valor não pode ser negativo.',
  valorCasas: 'Use no máximo 2 casas decimais.',
  valorInvalido: 'Valor inválido. Ex.: 2,50',
  valorAlto: 'Valor muito alto.',
} as const;

export type ParseValorResult = { ok: true; centavos: number } | { ok: false; error: string };

/**
 * Converte o texto digitado em centavos inteiros. Aceita "2,50", "2.50", "2",
 * "2,5" e "R$ 2,50". Rejeita negativos, letras, separador de milhar e mais de
 * 2 casas. Não passa por float, então não há erro de arredondamento.
 */
export function parseValorBRL(raw: string): ParseValorResult {
  const s = raw.trim().replace(/^R\$/i, '').replace(/\s/g, '');
  if (s === '') return { ok: false, error: CATEGORIA_FORM_MESSAGES.valorVazio };
  if (s.startsWith('-')) return { ok: false, error: CATEGORIA_FORM_MESSAGES.valorNegativo };
  if (/^\d+[.,]\d{3,}$/.test(s)) return { ok: false, error: CATEGORIA_FORM_MESSAGES.valorCasas };
  const m = /^(\d+)(?:[.,](\d{0,2}))?$/.exec(s);
  if (!m) return { ok: false, error: CATEGORIA_FORM_MESSAGES.valorInvalido };
  const inteiros = m[1].replace(/^0+(?=\d)/, '');
  if (inteiros.length > 8) return { ok: false, error: CATEGORIA_FORM_MESSAGES.valorAlto };
  const centavos = Number(inteiros) * 100 + Number((m[2] ?? '').padEnd(2, '0'));
  if (centavos > VALOR_MAX_CENTAVOS) return { ok: false, error: CATEGORIA_FORM_MESSAGES.valorAlto };
  return { ok: true, centavos };
}

/** Valor do banco → texto do campo ("2,50"). */
export function valorParaInput(valor: number | string): string {
  return (toCentavos(valor) / 100).toFixed(2).replace('.', ',');
}

export const categoriaFormSchema = z.object({
  nome: z
    .string()
    .trim()
    .min(1, CATEGORIA_FORM_MESSAGES.nomeVazio)
    .max(NOME_MAX, CATEGORIA_FORM_MESSAGES.nomeLongo),
  valor: z.string().transform((raw, ctx) => {
    const r = parseValorBRL(raw);
    if (!r.ok) {
      ctx.addIssue({ code: 'custom', message: r.error });
      return z.NEVER;
    }
    return r.centavos;
  }),
  ativa: z.boolean(),
});

export type CategoriaFormInput = z.input<typeof categoriaFormSchema>;
/** Saída validada: `nome` sem espaços nas pontas e `valor` em centavos. */
export type CategoriaFormOutput = z.output<typeof categoriaFormSchema>;
export type CategoriaFormErrors = Partial<Record<'nome' | 'valor', string>>;

export type CategoriaPayload = { nome: string; valor_unitario: number; ativa: boolean };

export function toCategoriaPayload(data: CategoriaFormOutput): CategoriaPayload {
  return { nome: data.nome, valor_unitario: fromCentavos(data.valor), ativa: data.ativa };
}

function normalizarNome(nome: string): string {
  return nome.trim().replace(/\s+/g, ' ').toLocaleLowerCase('pt-BR');
}

/**
 * Nome já usado por outra categoria do usuário, sem diferenciar maiúsculas.
 * O banco só tem `unique(user_id, nome)` (diferencia maiúsculas), então a
 * checagem case-insensitive é feita aqui; o erro 23505 continua como rede de segurança.
 */
export function nomeDuplicado(
  categorias: ReadonlyArray<{ id: string; nome: string }>,
  nome: string,
  ignorarId?: string,
): boolean {
  const alvo = normalizarNome(nome);
  return categorias.some((c) => c.id !== ignorarId && normalizarNome(c.nome) === alvo);
}

export type ValidarCategoriaResult =
  { ok: true; payload: CategoriaPayload } | { ok: false; errors: CategoriaFormErrors };

/** Valida o formulário inteiro (Zod + unicidade contra a lista carregada). */
export function validarCategoriaForm(
  input: CategoriaFormInput,
  existentes: ReadonlyArray<{ id: string; nome: string }>,
  ignorarId?: string,
): ValidarCategoriaResult {
  const parsed = categoriaFormSchema.safeParse(input);
  const errors: CategoriaFormErrors = {};
  if (!parsed.success) {
    for (const issue of parsed.error.issues) {
      const field = issue.path[0];
      if ((field === 'nome' || field === 'valor') && !errors[field]) errors[field] = issue.message;
    }
  }
  if (!errors.nome && nomeDuplicado(existentes, input.nome, ignorarId)) {
    errors.nome = CATEGORIA_FORM_MESSAGES.nomeDuplicado;
  }
  if (!parsed.success || errors.nome || errors.valor) return { ok: false, errors };
  return { ok: true, payload: toCategoriaPayload(parsed.data) };
}
