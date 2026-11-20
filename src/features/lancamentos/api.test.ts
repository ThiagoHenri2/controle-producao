import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fakeSupabase } from '@/test/supabaseMock';
import {
  createFakeCategoriasTable,
  makeCategoria,
} from '@/features/categorias/testing/fakeCategoriasTable';
import { createLancamentos, idsDeOutrosAutores, listLancamentosDoDia } from './api';
import { LancamentoError, toLancamentoError } from './errors';
import { montarItens, subtotalCentavos, totalCentavos, validarEdicao } from './schema';
import { createFakeLancamentosTable } from './testing/fakeLancamentosTable';
import { rotuloDataLonga, somarDias, tituloJaLancado } from './dates';

vi.mock('@/lib/supabase', async () => ({
  supabase: (await import('@/test/supabaseMock')).fakeSupabase.client,
}));

const categorias = createFakeCategoriasTable();
const lancamentos = createFakeLancamentosTable(() => categorias.rows);

describe('toLancamentoError', () => {
  it('mapeia data futura, categoria inválida/inativa e checks', () => {
    expect(
      toLancamentoError(
        {
          code: '23514',
          message:
            'new row for relation "lancamentos" violates check constraint "lancamentos_data_nao_futura"',
        },
        'x',
      ),
    ).toMatchObject({
      kind: 'data_futura',
      message: 'Não dá para lançar em data futura. Escolha hoje ou um dia anterior.',
    });
    expect(
      toLancamentoError({ code: '23514', message: 'Categoria inativa: não é possível' }, 'x').kind,
    ).toBe('categoria_inativa');
    expect(toLancamentoError({ code: '23503', message: 'Categoria inválida' }, 'x').kind).toBe(
      'categoria_invalida',
    );
    expect(toLancamentoError({ code: '23514', message: 'quantidade_check' }, 'x').kind).toBe(
      'invalido',
    );
  });

  it('usa o fallback em erros desconhecidos (sem texto técnico)', () => {
    const err = toLancamentoError(new TypeError('Failed to fetch'), 'Falhou.');
    expect(err).toBeInstanceOf(LancamentoError);
    expect(err).toMatchObject({ kind: 'desconhecido', message: 'Falhou.' });
  });
});

describe('cálculos em centavos', () => {
  const cats = [
    { id: 's', valor_unitario: 2.5 },
    { id: 'p', valor_unitario: '5.00' },
    { id: 'z', valor_unitario: 0.1 },
  ];

  it('50 × 2,50 + 20 × 5,00 = 22500 centavos', () => {
    expect(subtotalCentavos(cats, { s: 50, p: 20 })).toBe(22500);
  });

  it('não acumula erro de float (3 × 0,10 = 30 centavos)', () => {
    expect(subtotalCentavos(cats, { z: 3 })).toBe(30);
    expect(totalCentavos([{ valor_total: 0.1 }, { valor_total: '0.2' }])).toBe(30);
  });

  it('montarItens ignora quantidade 0/ausente e nunca envia valor_unitario', () => {
    expect(montarItens(cats, { s: 50, p: 0 })).toEqual([{ categoria_id: 's', quantidade: 50 }]);
    expect(montarItens(cats, {})).toEqual([]);
  });

  it('validarEdicao: inteiro 1..9999 e observação ≤ 200', () => {
    expect(validarEdicao({ quantidade: ' 25 ', observacao: '  ' })).toEqual({
      ok: true,
      patch: { quantidade: 25, observacao: null },
    });
    expect(validarEdicao({ quantidade: '2,5', observacao: '' })).toMatchObject({ ok: false });
    expect(validarEdicao({ quantidade: '10000', observacao: '' })).toMatchObject({
      ok: false,
      errors: { quantidade: 'A quantidade máxima é 9999.' },
    });
    expect(validarEdicao({ quantidade: '1', observacao: 'a'.repeat(201) })).toMatchObject({
      ok: false,
      errors: { observacao: 'Use no máximo 200 caracteres.' },
    });
  });
});

describe('datas', () => {
  const agora = new Date(2026, 10, 20, 12);
  it('rótulos Hoje/Ontem/dia da semana', () => {
    expect(rotuloDataLonga('2026-11-20', agora)).toBe('Hoje, 20/11/2026');
    expect(rotuloDataLonga('2026-11-19', agora)).toBe('Ontem, 19/11/2026');
    expect(rotuloDataLonga('2026-11-21', agora)).toBe('sáb, 21/11/2026');
    expect(tituloJaLancado('2026-11-18', agora)).toBe('Já lançado em 18/11/2026');
  });

  it('somarDias atravessa mês/ano sem deslocar por fuso', () => {
    expect(somarDias('2026-03-01', -1)).toBe('2026-02-28');
    expect(somarDias('2026-12-31', 1)).toBe('2027-01-01');
  });
});

describe('api de lançamentos', () => {
  beforeEach(() => {
    fakeSupabase.reset();
    categorias.reset();
    lancamentos.reset();
    fakeSupabase.setTableHandler('categorias', categorias.handler);
    fakeSupabase.setTableHandler('lancamentos', lancamentos.handler);
    categorias.seed([makeCategoria({ id: 'cat-p', nome: 'Pizza', valor_unitario: 5 })]);
  });

  it('insert em lote congela o preço; reajuste não altera o histórico', async () => {
    const hoje = '2026-01-10';
    await createLancamentos('user-1', hoje, [{ categoria_id: 'cat-p', quantidade: 20 }]);
    categorias.seed([makeCategoria({ id: 'cat-p', nome: 'Pizza', valor_unitario: 6 })]);
    await createLancamentos('user-1', hoje, [{ categoria_id: 'cat-p', quantidade: 1 }]);
    const lista = await listLancamentosDoDia('user-1', hoje);
    expect(lista.map((l) => [l.valor_unitario, l.valor_total, l.categoria?.nome])).toEqual([
      [5, 100, 'Pizza'],
      [6, 6, 'Pizza'],
    ]);
  });

  it('lista vazia não faz request', async () => {
    expect(await createLancamentos('user-1', '2026-01-10', [])).toEqual([]);
    expect(lancamentos.inserts).toHaveLength(0);
  });

  it('categoria inativa vira erro amigável e nada é gravado', async () => {
    categorias.seed([makeCategoria({ id: 'cat-p', ativa: false })]);
    await expect(
      createLancamentos('user-1', '2026-01-10', [{ categoria_id: 'cat-p', quantidade: 1 }]),
    ).rejects.toMatchObject({ kind: 'categoria_inativa' });
    expect(lancamentos.rows).toHaveLength(0);
  });

  it('insert envia user_id do alvo e nunca criado_por; a lista filtra por user_id', async () => {
    categorias.seed([
      makeCategoria({ id: 'cat-p', nome: 'Pizza', valor_unitario: 5 }),
      makeCategoria({ id: 'cat-j', nome: 'Pizza', valor_unitario: 4, user_id: 'joao' }),
    ]);
    await createLancamentos('joao', '2026-01-10', [{ categoria_id: 'cat-j', quantidade: 2 }]);
    await createLancamentos('user-1', '2026-01-10', [{ categoria_id: 'cat-p', quantidade: 1 }]);
    expect(lancamentos.inserts[0]).toEqual([
      { user_id: 'joao', data: '2026-01-10', categoria_id: 'cat-j', quantidade: 2 },
    ]);
    expect(lancamentos.inserts[0]?.[0]).not.toHaveProperty('criado_por');

    const doJoao = await listLancamentosDoDia('joao', '2026-01-10');
    expect(doJoao.map((l) => [l.user_id, l.valor_total])).toEqual([['joao', 8]]);
    const meus = await listLancamentosDoDia('user-1', '2026-01-10');
    expect(meus.map((l) => l.user_id)).toEqual(['user-1']);
    expect(lancamentos.selects.slice(-2)).toEqual([
      { user_id: 'joao', data: '2026-01-10' },
      { user_id: 'user-1', data: '2026-01-10' },
    ]);
  });

  it('idsDeOutrosAutores: só criado_por ≠ user_id e não nulo, ordenados e únicos', () => {
    expect(
      idsDeOutrosAutores([
        { user_id: 'joao', criado_por: 'maria' },
        { user_id: 'joao', criado_por: 'joao' },
        { user_id: 'joao', criado_por: null },
        { user_id: 'ana', criado_por: 'carla' },
        { user_id: 'ana', criado_por: 'maria' },
      ]),
    ).toEqual(['carla', 'maria']);
  });
});
