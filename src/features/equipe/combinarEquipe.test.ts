import { describe, expect, it } from 'vitest';
import type { ResumoUsuarioRow } from '@/lib/database.types';
import { combinarEquipe } from './ordenar';

function linha(user_id: string, nome: string, quantidade: number, valor: number): ResumoUsuarioRow {
  return {
    user_id,
    nome,
    username: nome.toLowerCase(),
    role: 'user',
    ativo: true,
    quantidade,
    valor,
    total_geral: 0,
  };
}

const RECEITAS = [linha('j', 'João', 70, 225), linha('a', 'Ana', 10, 30), linha('z', 'Zé', 0, 0)];
const DESPESAS = [linha('a', 'Ana', 1, 50), linha('j', 'João', 1, 35.9), linha('z', 'Zé', 0, 0)];

describe('combinarEquipe', () => {
  it('Ambos: merge por user_id em centavos, ordena por saldo e deixa quem tem 0 no fim', () => {
    const r = combinarEquipe('ambos', RECEITAS, DESPESAS);
    expect(r.map((l) => [l.nome, l.receitas, l.despesas, l.saldo, l.zero])).toEqual([
      ['João', 22500, 3590, 18910, false],
      ['Ana', 3000, 5000, -2000, false],
      ['Zé', 0, 0, 0, true],
    ]);
  });

  it('Receitas e Despesas mantêm a ordem da RPC do tipo', () => {
    expect(combinarEquipe('receitas', RECEITAS, []).map((l) => l.nome)).toEqual([
      'João',
      'Ana',
      'Zé',
    ]);
    expect(combinarEquipe('despesas', [], DESPESAS).map((l) => [l.nome, l.despesasQtd])).toEqual([
      ['Ana', 1],
      ['João', 1],
      ['Zé', 0],
    ]);
  });
});
