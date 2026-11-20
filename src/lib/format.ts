import { differenceInCalendarDays, format, isValid, parse } from 'date-fns';
import { ptBR } from 'date-fns/locale';

const ISO_DATE = 'yyyy-MM-dd';

const brl = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });

/**
 * Formata um valor em reais. Aceita number ou string vinda do Postgres (`numeric`
 * chega como string, ex.: "2.5"). O espaço entre "R$" e o número é normalizado
 * para um espaço comum (o Intl usa NBSP).
 */
export function formatBRL(valor: number | string): string {
  const n = typeof valor === 'string' ? Number(valor) : valor;
  if (!Number.isFinite(n)) return brl.format(0).replace(/\s/g, ' ');
  return brl.format(n).replace(/\s/g, ' ');
}

/** Converte `yyyy-MM-dd` em Date local (meia-noite local), sem passar por UTC. */
export function parseISODate(yyyyMMdd: string): Date {
  const d = parse(yyyyMMdd, ISO_DATE, new Date(2000, 0, 1));
  if (!isValid(d)) throw new Error(`Data inválida: "${yyyyMMdd}"`);
  return d;
}

/** Converte Date em `yyyy-MM-dd` no fuso local. */
export function toISODate(date: Date): string {
  return format(date, ISO_DATE);
}

/** `yyyy-MM-dd` → `dd/MM/yyyy`. */
export function formatData(yyyyMMdd: string): string {
  return format(parseISODate(yyyyMMdd), 'dd/MM/yyyy', { locale: ptBR });
}

/** `yyyy-MM-dd` → "Hoje", "Ontem" ou `dd/MM`. */
export function rotuloData(yyyyMMdd: string, agora: Date = new Date()): string {
  const d = parseISODate(yyyyMMdd);
  const diff = differenceInCalendarDays(agora, d);
  if (diff === 0) return 'Hoje';
  if (diff === 1) return 'Ontem';
  return format(d, 'dd/MM', { locale: ptBR });
}

/** Data de hoje no fuso local do aparelho, como `yyyy-MM-dd`. */
export function hojeISO(): string {
  return toISODate(new Date());
}

/**
 * Converte reais em centavos inteiros (arredondando para evitar erros de
 * ponto flutuante, ex.: 0.1 + 0.2). Aceita "2,50" ou "2.50".
 */
export function toCentavos(valor: number | string): number {
  const n = typeof valor === 'string' ? Number(valor.trim().replace(',', '.')) : valor;
  if (!Number.isFinite(n)) return 0;
  return Math.round(n * 100);
}

/** Converte centavos inteiros em reais (number). */
export function fromCentavos(centavos: number): number {
  return Math.round(centavos) / 100;
}

/** Soma valores em reais (number ou string do `numeric`) em centavos inteiros. */
export function somarCentavos(valores: Iterable<number | string>): number {
  let total = 0;
  for (const v of valores) total += toCentavos(v);
  return total;
}
