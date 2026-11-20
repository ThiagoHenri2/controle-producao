import { describe, expect, it } from 'vitest';
import { LancamentoError } from '@/features/lancamentos/errors';
import { DESPESA_ERROR_MESSAGES, toDespesaError } from './errors';
import { DESPESA_FORM_MESSAGES, validarDespesa } from './schema';

const base = { categoria_despesa_id: 'cd-1', valor: '35,90', descricao: '' };

describe('validarDespesa', () => {
  it('aceita "35,90", "35.90" e "R$ 35,90" em centavos; descrição vazia vira null', () => {
    for (const valor of ['35,90', '35.90', 'R$ 35,90']) {
      expect(validarDespesa({ ...base, valor })).toEqual({
        ok: true,
        despesa: { categoria_despesa_id: 'cd-1', valor: 35.9, descricao: null, centavos: 3590 },
      });
    }
    const r = validarDespesa({ ...base, descricao: '  posto  ' });
    expect(r.ok && r.despesa.descricao).toBe('posto');
  });

  it('bloqueia 0, negativo, vazio, 3 casas, categoria vazia e descrição longa', () => {
    const erro = (input: Partial<typeof base>) => {
      const r = validarDespesa({ ...base, ...input });
      return r.ok ? null : r.errors;
    };
    expect(erro({ valor: '0' })).toEqual({ valor: DESPESA_FORM_MESSAGES.valorZero });
    expect(erro({ valor: '0,00' })).toEqual({ valor: DESPESA_FORM_MESSAGES.valorZero });
    expect(erro({ valor: '-1' })).toEqual({ valor: 'O valor não pode ser negativo.' });
    expect(erro({ valor: '' })).toEqual({ valor: 'Informe o valor.' });
    expect(erro({ valor: '1,999' })).toEqual({ valor: 'Use no máximo 2 casas decimais.' });
    expect(erro({ categoria_despesa_id: '' })).toEqual({
      categoria_despesa_id: DESPESA_FORM_MESSAGES.categoriaVazia,
    });
    expect(erro({ descricao: 'x'.repeat(201) })).toEqual({
      descricao: DESPESA_FORM_MESSAGES.descricaoLonga,
    });
  });
});

describe('toDespesaError', () => {
  it('mapeia data futura, categoria inativa/inválida, checks e nulo para mensagens de despesa', () => {
    const k = (code: string, message: string) => toDespesaError({ code, message }, 'x');
    expect(k('23514', 'violates check constraint "despesas_data_nao_futura"')).toMatchObject({
      kind: 'data_futura',
      message: DESPESA_ERROR_MESSAGES.dataFutura,
    });
    expect(k('23514', 'Categoria de despesa inativa: não é possível lançar.')).toMatchObject({
      kind: 'categoria_inativa',
      message: DESPESA_ERROR_MESSAGES.categoriaInativa,
    });
    expect(k('23503', 'Categoria de despesa inválida')).toMatchObject({
      kind: 'categoria_invalida',
      message: DESPESA_ERROR_MESSAGES.categoriaInvalida,
    });
    expect(k('23514', 'despesas_valor_check').kind).toBe('invalido');
    expect(k('23502', 'null value in column "valor"').message).toBe(
      DESPESA_ERROR_MESSAGES.invalido,
    );
    const desconhecido = toDespesaError(new TypeError('Failed to fetch'), 'Falhou.');
    expect(desconhecido).toBeInstanceOf(LancamentoError);
    expect(desconhecido.message).toBe('Falhou.');
  });
});
