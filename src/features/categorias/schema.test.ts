import { describe, expect, it } from 'vitest';
import {
  CATEGORIA_FORM_MESSAGES as M,
  categoriaFormSchema,
  nomeDuplicado,
  parseValorBRL,
  validarCategoriaForm,
  valorParaInput,
} from './schema';

describe('parseValorBRL', () => {
  it.each([
    ['2,50', 250],
    ['2.50', 250],
    ['2,5', 250],
    ['2', 200],
    ['0', 0],
    ['0,00', 0],
    [' R$ 5,00 ', 500],
    ['10,', 1000],
    ['0,1', 10],
    ['0,07', 7],
    ['1234,56', 123456],
  ])('"%s" → %i centavos', (raw, centavos) => {
    expect(parseValorBRL(raw)).toEqual({ ok: true, centavos });
  });

  it.each([
    ['', M.valorVazio],
    ['   ', M.valorVazio],
    ['-1', M.valorNegativo],
    ['-0,50', M.valorNegativo],
    ['abc', M.valorInvalido],
    ['2a', M.valorInvalido],
    ['1.234,50', M.valorInvalido],
    ['2,555', M.valorCasas],
    ['2.505', M.valorCasas],
    ['999999999', M.valorAlto],
  ])('bloqueia "%s"', (raw, error) => {
    expect(parseValorBRL(raw)).toEqual({ ok: false, error });
  });

  it('não sofre erro de ponto flutuante', () => {
    expect(parseValorBRL('0,29')).toEqual({ ok: true, centavos: 29 });
    expect(parseValorBRL('1.15')).toEqual({ ok: true, centavos: 115 });
  });
});

describe('valorParaInput', () => {
  it('formata o valor do banco com vírgula e 2 casas', () => {
    expect(valorParaInput(2.5)).toBe('2,50');
    expect(valorParaInput('5')).toBe('5,00');
    expect(valorParaInput(0)).toBe('0,00');
  });
});

describe('categoriaFormSchema', () => {
  it('faz trim do nome e devolve o valor em centavos', () => {
    const r = categoriaFormSchema.safeParse({ nome: '  Pizza ', valor: '5,00', ativa: true });
    expect(r.success && r.data).toEqual({ nome: 'Pizza', valor: 500, ativa: true });
  });

  it('exige nome de 1 a 60 caracteres (após trim)', () => {
    expect(categoriaFormSchema.safeParse({ nome: '   ', valor: '1', ativa: true }).success).toBe(
      false,
    );
    expect(
      categoriaFormSchema.safeParse({ nome: 'a'.repeat(60), valor: '1', ativa: true }).success,
    ).toBe(true);
    expect(
      categoriaFormSchema.safeParse({ nome: 'a'.repeat(61), valor: '1', ativa: true }).success,
    ).toBe(false);
  });
});

describe('nomeDuplicado', () => {
  const lista = [
    { id: '1', nome: 'Pizza' },
    { id: '2', nome: 'Sanduíche' },
  ];

  it('compara sem diferenciar maiúsculas e ignora espaços nas pontas', () => {
    expect(nomeDuplicado(lista, ' pizza ')).toBe(true);
    expect(nomeDuplicado(lista, 'SANDUÍCHE')).toBe(true);
    expect(nomeDuplicado(lista, 'Pastel')).toBe(false);
  });

  it('ignora a própria categoria ao editar', () => {
    expect(nomeDuplicado(lista, 'PIZZA', '1')).toBe(false);
    expect(nomeDuplicado(lista, 'PIZZA', '2')).toBe(true);
  });
});

describe('validarCategoriaForm', () => {
  it('retorna o payload pronto para o banco', () => {
    expect(validarCategoriaForm({ nome: ' Sanduíche ', valor: '2,50', ativa: true }, [])).toEqual({
      ok: true,
      payload: { nome: 'Sanduíche', valor_unitario: 2.5, ativa: true },
    });
  });

  it('junta os erros por campo (nome duplicado e valor inválido)', () => {
    const r = validarCategoriaForm({ nome: 'pizza', valor: 'abc', ativa: true }, [
      { id: '1', nome: 'Pizza' },
    ]);
    expect(r).toEqual({ ok: false, errors: { nome: M.nomeDuplicado, valor: M.valorInvalido } });
  });

  it('nome vazio tem prioridade sobre duplicado', () => {
    const r = validarCategoriaForm({ nome: '', valor: '1', ativa: true }, []);
    expect(r).toEqual({ ok: false, errors: { nome: M.nomeVazio } });
  });
});
