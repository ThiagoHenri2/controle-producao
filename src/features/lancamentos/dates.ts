import { addDays, differenceInCalendarDays } from 'date-fns';
import { formatData, parseISODate, toISODate } from '@/lib/format';

const DIAS_SEMANA = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb'] as const;

/** Soma `dias` a uma data `yyyy-MM-dd` (sem passar por UTC). */
export function somarDias(yyyyMMdd: string, dias: number): string {
  return toISODate(addDays(parseISODate(yyyyMMdd), dias));
}

/** `yyyy-MM-dd` é uma data válida? */
export function isDataISO(valor: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(valor)) return false;
  try {
    return toISODate(parseISODate(valor)) === valor;
  } catch {
    return false;
  }
}

/** "Hoje, 20/11/2026", "Ontem, 19/11/2026" ou "qui, 19/11/2026". */
export function rotuloDataLonga(yyyyMMdd: string, agora: Date = new Date()): string {
  const d = parseISODate(yyyyMMdd);
  const diff = differenceInCalendarDays(agora, d);
  const prefixo = diff === 0 ? 'Hoje' : diff === 1 ? 'Ontem' : DIAS_SEMANA[d.getDay()];
  return `${prefixo}, ${formatData(yyyyMMdd)}`;
}

/** Dia da semana + data, sem "Hoje"/"Ontem": "qui, 19/11/2026". */
export function rotuloDiaSemana(yyyyMMdd: string): string {
  return `${DIAS_SEMANA[parseISODate(yyyyMMdd).getDay()]}, ${formatData(yyyyMMdd)}`;
}

/** `yyyy-MM-dd` → `dd/MM` (usado no toast). */
export function diaMes(yyyyMMdd: string): string {
  return formatData(yyyyMMdd).slice(0, 5);
}

/** Título da lista do dia: "Já lançado hoje", "Já lançado ontem" ou "Já lançado em 18/11/2026". */
export function tituloJaLancado(yyyyMMdd: string, agora: Date = new Date()): string {
  const diff = differenceInCalendarDays(agora, parseISODate(yyyyMMdd));
  if (diff === 0) return 'Já lançado hoje';
  if (diff === 1) return 'Já lançado ontem';
  return `Já lançado em ${formatData(yyyyMMdd)}`;
}
