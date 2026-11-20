import { describe, expect, it } from 'vitest';
import { combinarDias, saldoCentavos } from './saldo';

describe('saldo (centavos)', () => {
  it('saldoCentavos: 225,00 − 35,90 = 18910 (sem erro de float)', () => {
    expect(saldoCentavos(225, 35.9)).toBe(18910);
    expect(saldoCentavos('0.3', '0.1')).toBe(20);
    expect(saldoCentavos(10, 30)).toBe(-2000);
  });

  it('combinarDias: merge por data, desc, com 0 no lado que falta', () => {
    expect(
      combinarDias(
        [
          { data: '2026-11-20', valor: 100 },
          { data: '2026-11-19', valor: '125.00' },
        ],
        [
          { data: '2026-11-20', valor: 35.9 },
          { data: '2026-11-18', valor: 0.1 },
        ],
      ),
    ).toEqual([
      { data: '2026-11-20', receitas: 10000, despesas: 3590, saldo: 6410 },
      { data: '2026-11-19', receitas: 12500, despesas: 0, saldo: 12500 },
      { data: '2026-11-18', receitas: 0, despesas: 10, saldo: -10 },
    ]);
    expect(combinarDias([], [])).toEqual([]);
  });
});
