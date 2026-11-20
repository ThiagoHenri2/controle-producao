import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fakeSupabase } from '@/test/supabaseMock';
import { createCategoria, deleteCategoria, listCategorias, updateCategoria } from './api';
import { CATEGORIA_ERROR_MESSAGES, CategoriaError, toCategoriaError } from './errors';
import { createFakeCategoriasTable, makeCategoria } from './testing/fakeCategoriasTable';

vi.mock('@/lib/supabase', async () => ({
  supabase: (await import('@/test/supabaseMock')).fakeSupabase.client,
}));

const table = createFakeCategoriasTable();

describe('toCategoriaError', () => {
  it('mapeia 23505, 23503 e 23514 para mensagens amigáveis', () => {
    expect(toCategoriaError({ code: '23505', message: 'duplicate key' }, 'x')).toMatchObject({
      kind: 'duplicado',
      message: 'Já existe uma categoria com esse nome.',
    });
    expect(toCategoriaError({ code: '23503', message: 'fk' }, 'x')).toMatchObject({
      kind: 'em_uso',
      message: 'Esta categoria já tem lançamentos. Desative-a em vez de excluir.',
    });
    expect(toCategoriaError({ code: '23514', message: 'check' }, 'x').kind).toBe('invalido');
  });

  it('trata 23001 (FK restrict de lançamentos, como no banco real) como categoria em uso', () => {
    expect(toCategoriaError({ code: '23001', message: 'restrict' }, 'x')).toMatchObject({
      kind: 'em_uso',
      message: 'Esta categoria já tem lançamentos. Desative-a em vez de excluir.',
    });
  });

  it('usa o fallback para erros desconhecidos (sem texto técnico)', () => {
    const err = toCategoriaError(new TypeError('Failed to fetch'), 'Falhou.');
    expect(err).toBeInstanceOf(CategoriaError);
    expect(err).toMatchObject({ kind: 'desconhecido', message: 'Falhou.' });
  });
});

describe('api de categorias', () => {
  beforeEach(() => {
    fakeSupabase.reset();
    table.reset();
    fakeSupabase.setTableHandler('categorias', table.handler);
  });

  it('lista ativas primeiro e por nome; sem inativas por padrão', async () => {
    table.seed([
      makeCategoria({ id: 'a', nome: 'Pizza', valor_unitario: 5 }),
      makeCategoria({ id: 'b', nome: 'Água', ativa: false }),
      makeCategoria({ id: 'c', nome: 'Sanduíche' }),
    ]);
    expect((await listCategorias('user-1', { incluirInativas: true })).map((c) => c.nome)).toEqual([
      'Pizza',
      'Sanduíche',
      'Água',
    ]);
    expect((await listCategorias('user-1')).map((c) => c.nome)).toEqual(['Pizza', 'Sanduíche']);
  });

  it('filtra sempre por user_id (o gestor vê as de todos pela RLS, spec 008)', async () => {
    table.seed([
      makeCategoria({ id: 'a', nome: 'Pizza', user_id: 'user-1' }),
      makeCategoria({ id: 'b', nome: 'Pizza', user_id: 'joao' }),
    ]);
    expect((await listCategorias('joao')).map((c) => c.id)).toEqual(['b']);
    expect((await listCategorias('user-1')).map((c) => c.id)).toEqual(['a']);
    expect(table.selects).toEqual([
      { user_id: 'joao', ativa: true },
      { user_id: 'user-1', ativa: true },
    ]);
  });

  it('cria com nome sem espaços nas pontas', async () => {
    const cat = await createCategoria({ user_id: 'joao', nome: '  Pizza ', valor_unitario: 5 });
    expect(cat).toMatchObject({ user_id: 'joao', nome: 'Pizza', valor_unitario: 5, ativa: true });
    expect(table.inserts[0]).toMatchObject({ user_id: 'joao', nome: 'Pizza' });
  });

  it('nome duplicado vira CategoriaError "duplicado"', async () => {
    table.seed([makeCategoria({ nome: 'Pizza' })]);
    await expect(
      createCategoria({ user_id: 'user-1', nome: 'Pizza', valor_unitario: 5 }),
    ).rejects.toMatchObject({
      kind: 'duplicado',
      message: CATEGORIA_ERROR_MESSAGES.duplicado,
    });
  });

  it('atualiza nome/valor/ativa', async () => {
    table.seed([makeCategoria({ id: 'a', nome: 'Pizza', valor_unitario: 5 })]);
    const cat = await updateCategoria('a', { valor_unitario: 6, ativa: false });
    expect(cat).toMatchObject({ valor_unitario: 6, ativa: false });
  });

  it('excluir categoria com lançamentos vira CategoriaError "em_uso"', async () => {
    table.seed([makeCategoria({ id: 'a' }), makeCategoria({ id: 'b', nome: 'Pizza' })]);
    table.marcarEmUso('a');
    await expect(deleteCategoria('a')).rejects.toMatchObject({ kind: 'em_uso' });
    await deleteCategoria('b');
    expect(table.rows.map((r) => r.id)).toEqual(['a']);
  });

  it('erro de rede ao listar usa a mensagem de carregamento', async () => {
    table.failNext('PGRST000', 'connection refused');
    await expect(listCategorias('user-1')).rejects.toMatchObject({
      message: CATEGORIA_ERROR_MESSAGES.carregar,
    });
  });
});
