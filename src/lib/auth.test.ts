import { describe, expect, it } from 'vitest';
import { usernameToEmail } from './auth';

describe('usernameToEmail', () => {
  it('gera o e-mail sintético', () => {
    expect(usernameToEmail('joao')).toBe('joao@entregas.local');
  });

  it('remove espaços e converte para minúsculas', () => {
    expect(usernameToEmail('  Joao.Silva ')).toBe('joao.silva@entregas.local');
  });

  it('preserva os caracteres permitidos no username', () => {
    expect(usernameToEmail('ana_b-2')).toBe('ana_b-2@entregas.local');
  });
});
