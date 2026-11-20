import {
  differenceInCalendarDays,
  endOfMonth,
  endOfWeek,
  startOfMonth,
  startOfWeek,
} from 'date-fns';
import { z } from 'zod';
import { formatData, hojeISO, parseISODate, toISODate } from '@/lib/format';

/** Filtros rápidos (chips). */
export type PeriodoRapido = 'hoje' | 'semana' | 'mes';
export type PeriodoTipo = PeriodoRapido | 'personalizado';

/** Intervalo fechado, sempre `yyyy-MM-dd` no fuso local. */
export type Intervalo = { de: string; ate: string };
export type Periodo = Intervalo & { tipo: PeriodoTipo };

export const PERIODO_PADRAO: PeriodoRapido = 'mes';
export const PERIODOS_RAPIDOS: readonly PeriodoRapido[] = ['hoje', 'semana', 'mes'];
/** Parâmetros da query string que representam o período. */
export const PERIODO_PARAMS = ['periodo', 'de', 'ate'] as const;
/** Máximo de dias do intervalo, contando início e fim (igual à RPC). */
export const MAX_DIAS = 366;

export const PERIODO_MESSAGES = {
  deVazio: 'Informe a data inicial.',
  ateVazio: 'Informe a data final.',
  dataInvalida: 'Data inválida.',
  ordem: 'A data inicial não pode ser depois da final.',
  longo: `Escolha no máximo ${MAX_DIAS} dias.`,
} as const;

const ISO_RE = /^\d{4}-\d{2}-\d{2}$/;

/** `true` se a string é uma data real no formato `yyyy-MM-dd`. */
export function isISODate(value: string): boolean {
  if (!ISO_RE.test(value)) return false;
  try {
    // Round-trip: rejeita datas inexistentes como 2026-02-31.
    return toISODate(parseISODate(value)) === value;
  } catch {
    return false;
  }
}

/** Limites de Hoje / Semana (segunda a domingo) / Mês, a partir de `hoje` (`yyyy-MM-dd`). */
export function intervaloRapido(tipo: PeriodoRapido, hoje: string = hojeISO()): Intervalo {
  const d = parseISODate(hoje);
  switch (tipo) {
    case 'hoje':
      return { de: hoje, ate: hoje };
    case 'semana':
      return {
        de: toISODate(startOfWeek(d, { weekStartsOn: 1 })),
        ate: toISODate(endOfWeek(d, { weekStartsOn: 1 })),
      };
    case 'mes':
      return { de: toISODate(startOfMonth(d)), ate: toISODate(endOfMonth(d)) };
  }
}

export function periodoRapido(tipo: PeriodoRapido, hoje: string = hojeISO()): Periodo {
  return { tipo, ...intervaloRapido(tipo, hoje) };
}

/** Quantidade de dias do intervalo, contando início e fim. */
export function diasNoIntervalo({ de, ate }: Intervalo): number {
  return differenceInCalendarDays(parseISODate(ate), parseISODate(de)) + 1;
}

const dataSchema = (vazio: string) =>
  z.string().trim().min(1, vazio).refine(isISODate, PERIODO_MESSAGES.dataInvalida);

/** Valida o período personalizado: datas válidas, início ≤ fim e no máximo 366 dias. */
export const intervaloSchema = z
  .object({ de: dataSchema(PERIODO_MESSAGES.deVazio), ate: dataSchema(PERIODO_MESSAGES.ateVazio) })
  .superRefine(({ de, ate }, ctx) => {
    if (!isISODate(de) || !isISODate(ate)) return;
    if (de > ate) {
      ctx.addIssue({ code: 'custom', path: ['ate'], message: PERIODO_MESSAGES.ordem });
    } else if (diasNoIntervalo({ de, ate }) > MAX_DIAS) {
      ctx.addIssue({ code: 'custom', path: ['ate'], message: PERIODO_MESSAGES.longo });
    }
  });

export type IntervaloErrors = Partial<Record<'de' | 'ate', string>>;
export type ValidarIntervaloResult =
  { ok: true; intervalo: Intervalo } | { ok: false; errors: IntervaloErrors };

export function validarIntervalo(input: { de: string; ate: string }): ValidarIntervaloResult {
  const parsed = intervaloSchema.safeParse(input);
  if (parsed.success) return { ok: true, intervalo: parsed.data };
  const errors: IntervaloErrors = {};
  for (const issue of parsed.error.issues) {
    const field = issue.path[0];
    if ((field === 'de' || field === 'ate') && !errors[field]) errors[field] = issue.message;
  }
  return { ok: false, errors };
}

/**
 * Lê o filtro da query string:
 * - `?periodo=hoje|semana|mes`;
 * - `?de=yyyy-MM-dd&ate=yyyy-MM-dd` (personalizado, se válido);
 * - qualquer outra coisa → Mês (padrão).
 */
export function periodoFromSearchParams(
  params: URLSearchParams,
  hoje: string = hojeISO(),
): Periodo {
  const tipo = params.get('periodo');
  if (tipo && (PERIODOS_RAPIDOS as readonly string[]).includes(tipo)) {
    return periodoRapido(tipo as PeriodoRapido, hoje);
  }
  const de = params.get('de');
  const ate = params.get('ate');
  if (de && ate) {
    const r = validarIntervalo({ de, ate });
    if (r.ok) return { tipo: 'personalizado', ...r.intervalo };
  }
  return periodoRapido(PERIODO_PADRAO, hoje);
}

/** Query string que representa o período (inverso de `periodoFromSearchParams`). */
export function periodoToSearchParams(periodo: Periodo): URLSearchParams {
  if (periodo.tipo === 'personalizado') {
    return new URLSearchParams({ de: periodo.de, ate: periodo.ate });
  }
  return new URLSearchParams({ periodo: periodo.tipo });
}

/** "01/11/2026 – 30/11/2026" (ou só a data, se for um dia). */
export function formatIntervalo({ de, ate }: Intervalo): string {
  return de === ate ? formatData(de) : `${formatData(de)} – ${formatData(ate)}`;
}
