/**
 * Saldo = receitas − despesas (spec 009), sempre em centavos inteiros.
 * Funções puras para o "Ambos" do Relatório e da Equipe.
 */
import { toCentavos } from '@/lib/format';

type ValorDia = { data: string; valor: number | string };

/** Um dia com receitas, despesas e saldo, em centavos. */
export type DiaSaldo = { data: string; receitas: number; despesas: number; saldo: number };

/** Saldo em centavos a partir de valores em reais (number ou string do `numeric`). */
export function saldoCentavos(receitas: number | string, despesas: number | string): number {
  return toCentavos(receitas) - toCentavos(despesas);
}

/**
 * Junta os resumos por dia de receitas e de despesas pela data (merge no front,
 * somando em centavos). Dias só com um dos lados entram com 0 no outro.
 * Ordem: data desc (igual às RPCs).
 */
export function combinarDias(
  receitas: readonly ValorDia[],
  despesas: readonly ValorDia[],
): DiaSaldo[] {
  const dias = new Map<string, { receitas: number; despesas: number }>();
  const acc = (data: string) => {
    const d = dias.get(data) ?? { receitas: 0, despesas: 0 };
    dias.set(data, d);
    return d;
  };
  for (const r of receitas) acc(r.data).receitas += toCentavos(r.valor);
  for (const d of despesas) acc(d.data).despesas += toCentavos(d.valor);
  return [...dias.entries()]
    .sort(([a], [b]) => (a < b ? 1 : a > b ? -1 : 0))
    .map(([data, d]) => ({ data, ...d, saldo: d.receitas - d.despesas }));
}
