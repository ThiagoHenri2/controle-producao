import { describe, expect, it, vi } from 'vitest';
import {
  catsFromSearchParams,
  catsQueryKey,
  resolverSelecao,
  rotuloFiltro,
  toSearchString,
  withCats,
} from './filtroCategorias';
import { resumoKeys } from './hooks';

vi.mock('@/lib/supabase', async () => ({
  supabase: (await import('@/test/supabaseMock')).fakeSupabase.client,
}));

const IDS = ['a', 'b', 'c'];
const CATS = [
  { id: 'a', nome: 'Sanduíche' },
  { id: 'b', nome: 'Pizza' },
  { id: 'c', nome: 'Hot-dog' },
];

describe('filtro de categorias', () => {
  it('lê ?cats= sem vazios nem repetidos', () => {
    expect(catsFromSearchParams(new URLSearchParams(''))).toEqual([]);
    expect(catsFromSearchParams(new URLSearchParams('cats='))).toEqual([]);
    expect(catsFromSearchParams(new URLSearchParams('cats=b,,a,b'))).toEqual(['b', 'a']);
  });

  it('ignora ids desconhecidos; nenhum ou todos → null (todas)', () => {
    expect(resolverSelecao([], IDS)).toBeNull();
    expect(resolverSelecao(['x'], IDS)).toBeNull();
    expect(resolverSelecao(['c', 'x', 'a'], IDS)).toEqual(['a', 'c']);
    expect(resolverSelecao(['c', 'b', 'a'], IDS)).toBeNull();
  });

  it('grava cats preservando o período; todas remove cats', () => {
    const base = new URLSearchParams('periodo=hoje&cats=a');
    expect(toSearchString(withCats(base, ['c', 'b'], IDS))).toBe('?periodo=hoje&cats=b,c');
    expect(toSearchString(withCats(base, IDS, IDS))).toBe('?periodo=hoje');
    expect(toSearchString(withCats(base, null, IDS))).toBe('?periodo=hoje');
    expect(toSearchString(withCats(new URLSearchParams(), null, IDS))).toBe('');
  });

  it('query key: categorias ordenadas ou "todas", sob o prefixo resumo', () => {
    expect(catsQueryKey(null)).toBe('todas');
    expect(resumoKeys.periodo('u1', '2026-11-01', '2026-11-30', ['c', 'a'])).toEqual([
      'resumo',
      'u1',
      '2026-11-01',
      '2026-11-30',
      'a,c',
    ]);
    expect(resumoKeys.periodo('u1', '2026-11-01', '2026-11-30', ['a', 'c'])).toEqual(
      resumoKeys.periodo('u1', '2026-11-01', '2026-11-30', ['c', 'a']),
    );
    expect(resumoKeys.periodo('u1', '2026-11-01', '2026-11-30')[4]).toBe('todas');
    expect(resumoKeys.periodo('u1', '2026-11-01', '2026-11-30').slice(0, 1)).toEqual([
      ...resumoKeys.all,
    ]);
  });

  it('rótulo: Todas / nome da única / X de Y', () => {
    expect(rotuloFiltro(null, CATS)).toBe('Todas');
    expect(rotuloFiltro(['b'], CATS)).toBe('Pizza');
    expect(rotuloFiltro(['a', 'b'], CATS)).toBe('2 de 3');
  });
});
