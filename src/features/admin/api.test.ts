import { FunctionsFetchError, FunctionsHttpError } from '@supabase/supabase-js';
import { describe, expect, it } from 'vitest';
import { AdminUsersError, toAdminUsersError } from './api';
import { ADMIN_MESSAGES, newUserSchema } from './schemas';

function httpError(status: number, body: unknown) {
  const text = typeof body === 'string' ? body : JSON.stringify(body);
  return new FunctionsHttpError(
    new Response(text, { status, headers: { 'Content-Type': 'application/json' } }),
  );
}

describe('toAdminUsersError', () => {
  it('usa a mensagem { error } do corpo da resposta', async () => {
    const err = await toAdminUsersError(httpError(409, { error: 'Usuário já existe' }));
    expect(err).toBeInstanceOf(AdminUsersError);
    expect(err.status).toBe(409);
    expect(err.message).toBe('Usuário já existe');
  });

  it('cai na mensagem padrão do status quando o corpo não é JSON', async () => {
    const err = await toAdminUsersError(httpError(403, 'nope'));
    expect(err.status).toBe(403);
    expect(err.message).toBe('Acesso negado');
  });

  it('falha de rede vira mensagem de conexão', async () => {
    const err = await toAdminUsersError(new FunctionsFetchError(new Error('offline')));
    expect(err.status).toBeNull();
    expect(err.message).toMatch(/conexão/);
  });

  it('erro desconhecido vira mensagem genérica', async () => {
    const err = await toAdminUsersError(new Error('boom'));
    expect(err.message).toBe('Não foi possível concluir. Tente de novo.');
  });
});

describe('newUserSchema (igual ao backend)', () => {
  it('normaliza o username com trim + minúsculas', () => {
    const parsed = newUserSchema.parse({
      nome: ' João ',
      username: '  Joao.Silva ',
      password: '123456',
    });
    expect(parsed).toEqual({ nome: 'João', username: 'joao.silva', password: '123456' });
  });

  it.each(['jo', 'a'.repeat(31), 'joão', 'jo ao', 'jo@o'])('rejeita username "%s"', (username) => {
    const result = newUserSchema.safeParse({ nome: 'X', username, password: '123456' });
    expect(result.success).toBe(false);
    expect(result.error?.issues[0]?.message).toBe(ADMIN_MESSAGES.usernameInvalid);
  });

  it.each(['abc', 'a_b-c.d', 'a'.repeat(30), 'user123'])('aceita username "%s"', (username) => {
    expect(newUserSchema.safeParse({ nome: 'X', username, password: '123456' }).success).toBe(true);
  });

  it('exige senha com pelo menos 6 caracteres', () => {
    const result = newUserSchema.safeParse({ nome: 'X', username: 'abc', password: '12345' });
    expect(result.error?.issues[0]?.message).toBe(ADMIN_MESSAGES.passwordMin);
  });
});
