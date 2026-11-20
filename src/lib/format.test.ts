import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  formatBRL,
  formatData,
  fromCentavos,
  hojeISO,
  parseISODate,
  rotuloData,
  toCentavos,
} from './format';

describe('formatBRL', () => {
  it('formata number', () => {
    expect(formatBRL(225)).toBe('R$ 225,00');
  });

  it('formata string vinda do numeric do Postgres', () => {
    expect(formatBRL('2.5')).toBe('R$ 2,50');
  });

  it('formata milhar e zero', () => {
    expect(formatBRL(1234.5)).toBe('R$ 1.234,50');
    expect(formatBRL(0)).toBe('R$ 0,00');
  });

  it('valor inválido vira R$ 0,00', () => {
    expect(formatBRL('abc')).toBe('R$ 0,00');
  });
});

describe('formatData / parseISODate', () => {
  it('formata yyyy-MM-dd como dd/MM/yyyy sem deslocar o dia', () => {
    expect(formatData('2026-01-01')).toBe('01/01/2026');
    expect(formatData('2026-11-20')).toBe('20/11/2026');
  });

  it('interpreta a data no fuso local', () => {
    const d = parseISODate('2026-03-05');
    expect(d.getFullYear()).toBe(2026);
    expect(d.getMonth()).toBe(2);
    expect(d.getDate()).toBe(5);
  });

  it('lança erro para data inválida', () => {
    expect(() => formatData('20/11/2026')).toThrow();
  });
});

describe('com relógio fixo em America/Sao_Paulo', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('o ambiente de teste roda em America/Sao_Paulo', () => {
    expect(process.env.TZ).toBe('America/Sao_Paulo');
    expect(Intl.DateTimeFormat().resolvedOptions().timeZone).toBe('America/Sao_Paulo');
  });

  it('hojeISO retorna a data local, não UTC, às 23:30', () => {
    // 20/11/2026 23:30 em São Paulo (UTC-3) = 21/11/2026 02:30 UTC.
    vi.setSystemTime(new Date('2026-11-21T02:30:00Z'));
    expect(new Date().toISOString().slice(0, 10)).toBe('2026-11-21'); // UTC já virou o dia
    expect(hojeISO()).toBe('2026-11-20');
  });

  it('rotuloData retorna Hoje/Ontem/dd/MM', () => {
    vi.setSystemTime(new Date('2026-11-21T02:30:00Z')); // 20/11 23:30 local
    expect(rotuloData('2026-11-20')).toBe('Hoje');
    expect(rotuloData('2026-11-19')).toBe('Ontem');
    expect(rotuloData('2026-11-18')).toBe('18/11');
  });
});

describe('centavos', () => {
  it('converte reais em centavos sem erro de float', () => {
    expect(toCentavos(0.1 + 0.2)).toBe(30);
    expect(toCentavos('2.5')).toBe(250);
    expect(toCentavos('2,50')).toBe(250);
    expect(toCentavos(19.99)).toBe(1999);
    expect(toCentavos('')).toBe(0);
  });

  it('converte centavos em reais', () => {
    expect(fromCentavos(250)).toBe(2.5);
    expect(fromCentavos(toCentavos(1.15) * 3)).toBe(3.45);
  });
});
