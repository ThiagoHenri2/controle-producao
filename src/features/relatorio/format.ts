const inteiro = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 0 });

/** 1020 → "1.020". */
export function formatInteiro(n: number | string): string {
  const v = typeof n === 'string' ? Number(n) : n;
  return inteiro.format(Number.isFinite(v) ? v : 0);
}

/** "1 entrega" / "1.020 entregas". */
export function formatEntregas(n: number): string {
  return `${formatInteiro(n)} ${n === 1 ? 'entrega' : 'entregas'}`;
}

/** "1 lançamento" / "3 lançamentos" (despesas). */
export function formatLancamentos(n: number): string {
  return `${formatInteiro(n)} ${n === 1 ? 'lançamento' : 'lançamentos'}`;
}

/**
 * Percentual inteiro (0–100) de `valor` sobre `total`, usado só na largura das
 * barras. Não é exibido como valor monetário.
 */
export function percentual(valor: number | string, total: number | string): number {
  const v = Number(valor);
  const t = Number(total);
  if (!Number.isFinite(v) || !Number.isFinite(t) || t <= 0) return 0;
  return Math.min(100, Math.max(0, Math.round((v / t) * 100)));
}
