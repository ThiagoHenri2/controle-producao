import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  PERIODO_MESSAGES,
  diasNoIntervalo,
  formatIntervalo,
  intervaloRapido,
  isISODate,
  periodoFromSearchParams,
  periodoToSearchParams,
  validarIntervalo,
} from './periodos';

/** Fixa o relógio num horário local (TZ America/Sao_Paulo no vitest). */
function fixarRelogio(ano: number, mes: number, dia: number, hora = 12, minuto = 0) {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date(ano, mes - 1, dia, hora, minuto));
}

afterEach(() => {
  vi.useRealTimers();
});

describe('intervaloRapido', () => {
  it('num domingo (22/11/2026): semana vai de segunda 16/11 até o próprio domingo', () => {
    fixarRelogio(2026, 11, 22);
    expect(intervaloRapido('hoje')).toEqual({ de: '2026-11-22', ate: '2026-11-22' });
    expect(intervaloRapido('semana')).toEqual({ de: '2026-11-16', ate: '2026-11-22' });
    expect(intervaloRapido('mes')).toEqual({ de: '2026-11-01', ate: '2026-11-30' });
  });

  it('numa segunda (23/11/2026): semana começa no próprio dia', () => {
    fixarRelogio(2026, 11, 23);
    expect(intervaloRapido('semana')).toEqual({ de: '2026-11-23', ate: '2026-11-29' });
  });

  it('no dia 1º (01/11/2026, também domingo): semana cruza o mês anterior; mês é novembro', () => {
    fixarRelogio(2026, 11, 1);
    expect(intervaloRapido('hoje')).toEqual({ de: '2026-11-01', ate: '2026-11-01' });
    expect(intervaloRapido('semana')).toEqual({ de: '2026-10-26', ate: '2026-11-01' });
    expect(intervaloRapido('mes')).toEqual({ de: '2026-11-01', ate: '2026-11-30' });
  });

  it('logo depois da meia-noite local não volta para o dia anterior (sem UTC)', () => {
    fixarRelogio(2026, 12, 1, 0, 5);
    expect(intervaloRapido('hoje')).toEqual({ de: '2026-12-01', ate: '2026-12-01' });
    expect(intervaloRapido('mes')).toEqual({ de: '2026-12-01', ate: '2026-12-31' });
  });

  it('às 23h59 do último dia do ano continua em 2026', () => {
    fixarRelogio(2026, 12, 31, 23, 59);
    expect(intervaloRapido('hoje')).toEqual({ de: '2026-12-31', ate: '2026-12-31' });
    expect(intervaloRapido('semana')).toEqual({ de: '2026-12-28', ate: '2027-01-03' });
    expect(intervaloRapido('mes')).toEqual({ de: '2026-12-01', ate: '2026-12-31' });
  });

  it('na virada do ano (01/01/2027): semana começa em 2026, mês é janeiro de 2027', () => {
    fixarRelogio(2027, 1, 1);
    expect(intervaloRapido('semana')).toEqual({ de: '2026-12-28', ate: '2027-01-03' });
    expect(intervaloRapido('mes')).toEqual({ de: '2027-01-01', ate: '2027-01-31' });
  });

  it('fevereiro de ano bissexto termina no dia 29', () => {
    expect(intervaloRapido('mes', '2028-02-10')).toEqual({ de: '2028-02-01', ate: '2028-02-29' });
  });
});

describe('validarIntervalo', () => {
  it('aceita início = fim e início < fim', () => {
    expect(validarIntervalo({ de: '2026-11-20', ate: '2026-11-20' }).ok).toBe(true);
    expect(validarIntervalo({ de: '2026-11-01', ate: '2026-11-30' })).toEqual({
      ok: true,
      intervalo: { de: '2026-11-01', ate: '2026-11-30' },
    });
  });

  it('bloqueia início > fim com mensagem no campo "Até"', () => {
    expect(validarIntervalo({ de: '2026-11-15', ate: '2026-11-10' })).toEqual({
      ok: false,
      errors: { ate: PERIODO_MESSAGES.ordem },
    });
  });

  it('aceita 366 dias (contando início e fim) e bloqueia 367', () => {
    expect(diasNoIntervalo({ de: '2028-01-01', ate: '2028-12-31' })).toBe(366);
    expect(validarIntervalo({ de: '2028-01-01', ate: '2028-12-31' }).ok).toBe(true);
    expect(validarIntervalo({ de: '2026-01-01', ate: '2027-01-02' })).toEqual({
      ok: false,
      errors: { ate: PERIODO_MESSAGES.longo },
    });
  });

  it('exige as duas datas e rejeita datas inexistentes', () => {
    expect(validarIntervalo({ de: '', ate: '' })).toEqual({
      ok: false,
      errors: { de: PERIODO_MESSAGES.deVazio, ate: PERIODO_MESSAGES.ateVazio },
    });
    expect(validarIntervalo({ de: '2026-02-31', ate: '2026-03-01' })).toEqual({
      ok: false,
      errors: { de: PERIODO_MESSAGES.dataInvalida },
    });
    expect(isISODate('20/11/2026')).toBe(false);
    expect(isISODate('2026-11-20')).toBe(true);
  });
});

describe('query string', () => {
  const hoje = '2026-11-20';
  const ler = (qs: string) => periodoFromSearchParams(new URLSearchParams(qs), hoje);

  it('padrão é Mês', () => {
    expect(ler('')).toEqual({ tipo: 'mes', de: '2026-11-01', ate: '2026-11-30' });
  });

  it('lê ?periodo=hoje|semana|mes', () => {
    expect(ler('periodo=hoje')).toEqual({ tipo: 'hoje', de: hoje, ate: hoje });
    expect(ler('periodo=semana')).toEqual({ tipo: 'semana', de: '2026-11-16', ate: '2026-11-22' });
  });

  it('lê ?de&ate como personalizado', () => {
    expect(ler('de=2026-10-05&ate=2026-10-20')).toEqual({
      tipo: 'personalizado',
      de: '2026-10-05',
      ate: '2026-10-20',
    });
  });

  it('URL inválida (início > fim, data quebrada, período desconhecido) cai no Mês', () => {
    for (const qs of ['de=2026-11-15&ate=2026-11-10', 'de=abc&ate=2026-11-10', 'periodo=ano']) {
      expect(ler(qs).tipo).toBe('mes');
    }
  });

  it('escreve e relê o mesmo período', () => {
    expect(periodoToSearchParams({ tipo: 'semana', de: 'x', ate: 'y' }).toString()).toBe(
      'periodo=semana',
    );
    const p = { tipo: 'personalizado' as const, de: '2026-10-05', ate: '2026-10-20' };
    const qs = periodoToSearchParams(p).toString();
    expect(qs).toBe('de=2026-10-05&ate=2026-10-20');
    expect(ler(qs)).toEqual(p);
  });
});

describe('formatIntervalo', () => {
  it('mostra dd/MM/yyyy', () => {
    expect(formatIntervalo({ de: '2026-11-01', ate: '2026-11-30' })).toBe(
      '01/11/2026 – 30/11/2026',
    );
    expect(formatIntervalo({ de: '2026-11-20', ate: '2026-11-20' })).toBe('20/11/2026');
  });
});
