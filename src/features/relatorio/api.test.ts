import { beforeEach, describe, expect, expectTypeOf, it, vi } from 'vitest';
import type { TypedSupabaseClient } from '@/lib/supabase';
import { fakeSupabase } from '@/test/supabaseMock';
import { fetchResumo, type ResumoCategoria } from './api';
import { RELATORIO_ERROR_MESSAGES, RelatorioError } from './errors';

vi.mock('@/lib/supabase', async () => ({
  supabase: (await import('@/test/supabaseMock')).fakeSupabase.client,
}));

// Verificação de tipo (garantida pelo `tsc -b`): a RPC é tipada.
function rpcCategoria(client: TypedSupabaseClient) {
  return client.rpc('resumo_por_categoria', { p_de: '2026-11-01', p_ate: '2026-11-30' });
}
type RpcRow = NonNullable<Awaited<ReturnType<typeof rpcCategoria>>['data']>[number];

const linha = (over: Partial<ResumoCategoria>): ResumoCategoria => ({
  categoria_id: 'c1',
  nome: 'Sanduíche',
  ativa: true,
  quantidade: 50,
  valor: 125,
  total_geral: 225,
  ...over,
});

describe('fetchResumo', () => {
  beforeEach(() => fakeSupabase.reset());

  it('tipa supabase.rpc("resumo_por_categoria")', () => {
    expectTypeOf(rpcCategoria).toBeFunction();
    expectTypeOf<RpcRow>().toEqualTypeOf<ResumoCategoria>();
    expectTypeOf<RpcRow['total_geral']>().toEqualTypeOf<number>();
  });

  it('chama as duas RPCs com p_de/p_ate e usa o total_geral do banco', async () => {
    fakeSupabase.setRpcHandler('resumo_por_categoria', () => ({
      data: [linha({}), linha({ categoria_id: 'c2', nome: 'Pizza', quantidade: 20, valor: 100 })],
      error: null,
    }));
    fakeSupabase.setRpcHandler('resumo_por_dia', () => ({
      data: [{ data: '2026-11-20', quantidade: 70, valor: 225 }],
      error: null,
    }));

    const r = await fetchResumo('2026-11-01', '2026-11-30');

    expect(fakeSupabase.rpc).toHaveBeenCalledWith('resumo_por_categoria', {
      p_de: '2026-11-01',
      p_ate: '2026-11-30',
    });
    expect(fakeSupabase.rpc).toHaveBeenCalledWith('resumo_por_dia', {
      p_de: '2026-11-01',
      p_ate: '2026-11-30',
    });
    expect(r.totalGeral).toBe(225);
    expect(r.quantidadeTotal).toBe(70);
    expect(r.dias).toHaveLength(1);
  });

  it('envia p_categorias só quando há filtro', async () => {
    fakeSupabase.setRpcHandler('resumo_por_categoria', () => ({
      data: [
        linha({ categoria_id: 'c2', nome: 'Pizza', quantidade: 20, valor: 100, total_geral: 100 }),
      ],
      error: null,
    }));
    fakeSupabase.setRpcHandler('resumo_por_dia', () => ({ data: [], error: null }));

    const r = await fetchResumo('2026-11-01', '2026-11-30', ['c2']);
    const filtrado = { p_de: '2026-11-01', p_ate: '2026-11-30', p_categorias: ['c2'] };
    expect(fakeSupabase.rpc).toHaveBeenCalledWith('resumo_por_categoria', filtrado);
    expect(fakeSupabase.rpc).toHaveBeenCalledWith('resumo_por_dia', filtrado);
    expect(r.totalGeral).toBe(100);

    fakeSupabase.rpc.mockClear();
    await fetchResumo('2026-11-01', '2026-11-30', null);
    for (const [, args] of fakeSupabase.rpc.mock.calls) {
      expect(args).not.toHaveProperty('p_categorias');
    }
  });

  it('sem linhas: total 0', async () => {
    fakeSupabase.setRpcHandler('resumo_por_categoria', () => ({ data: [], error: null }));
    fakeSupabase.setRpcHandler('resumo_por_dia', () => ({ data: [], error: null }));
    expect(await fetchResumo('2026-11-01', '2026-11-30')).toEqual({
      categorias: [],
      dias: [],
      totalGeral: 0,
      quantidadeTotal: 0,
    });
  });

  it('22023 vira "periodo_invalido" com a mensagem pt-BR do banco', async () => {
    const error = { code: '22023', message: 'Período inválido: o intervalo máximo é de 366 dias.' };
    fakeSupabase.setRpcHandler('resumo_por_categoria', () => ({ data: null, error }));
    fakeSupabase.setRpcHandler('resumo_por_dia', () => ({ data: null, error }));
    const err = await fetchResumo('2025-01-01', '2026-11-30').catch((e: unknown) => e);
    expect(err).toBeInstanceOf(RelatorioError);
    expect(err).toMatchObject({ kind: 'periodo_invalido', message: error.message });
  });

  it('outros erros viram mensagem genérica (sem texto técnico)', async () => {
    const error = { code: '42501', message: 'permission denied for function' };
    fakeSupabase.setRpcHandler('resumo_por_categoria', () => ({ data: null, error }));
    fakeSupabase.setRpcHandler('resumo_por_dia', () => ({ data: [], error: null }));
    await expect(fetchResumo('2026-11-01', '2026-11-30')).rejects.toMatchObject({
      kind: 'desconhecido',
      message: RELATORIO_ERROR_MESSAGES.carregar,
    });
  });
});
