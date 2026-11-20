import { describe, expect, it } from 'vitest';
import { agruparNomes, nomesFromSearchParams, normalizarNome, withNomes } from './nomes';
import { ordenarEquipe } from './ordenar';
import type { ResumoUsuario } from './api';

describe('filtro por nome (Equipe)', () => {
  it('normaliza com trim + minúsculas', () => {
    expect(normalizarNome('  PiZZa ')).toBe('pizza');
  });

  it('agrupa sem diferenciar maiúsculas e mostra a grafia mais comum', () => {
    expect(agruparNomes(['Pizza', 'pizza ', 'Pizza', 'Sanduíche', 'Água', '  '])).toEqual([
      { id: 'água', nome: 'Água' },
      { id: 'pizza', nome: 'Pizza' },
      { id: 'sanduíche', nome: 'Sanduíche' },
    ]);
  });

  it('lê ?nomes repetido e grava só chaves conhecidas (todas = sem filtro)', () => {
    const params = new URLSearchParams('periodo=mes&nomes=Pizza&nomes=pizza&nomes=x,y');
    expect(nomesFromSearchParams(params)).toEqual(['pizza', 'x,y']);

    const existentes = ['pizza', 'sanduíche', 'a,b'];
    expect(withNomes(params, ['Pizza', 'a,b'], existentes).getAll('nomes')).toEqual([
      'pizza',
      'a,b',
    ]);
    expect(withNomes(params, existentes, existentes).has('nomes')).toBe(false);
    expect(withNomes(params, null, existentes).get('periodo')).toBe('mes');
  });

  it('ordenarEquipe: quem tem 0 vai para o fim', () => {
    const linha = (user_id: string, quantidade: number, valor: number): ResumoUsuario => ({
      user_id,
      nome: user_id,
      username: user_id,
      role: 'user',
      ativo: true,
      quantidade,
      valor,
      total_geral: 0,
    });
    expect(
      ordenarEquipe([linha('a', 0, 0), linha('b', 2, 10), linha('c', 0, 0), linha('d', 1, 5)]).map(
        (u) => u.user_id,
      ),
    ).toEqual(['b', 'd', 'a', 'c']);
  });
});
