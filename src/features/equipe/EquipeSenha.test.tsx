import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { FunctionsHttpError } from '@supabase/supabase-js';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createFakeCategoriasTable } from '@/features/categorias/testing/fakeCategoriasTable';
import { fakeSupabase, makeProfile } from '@/test/supabaseMock';
import { renderApp } from '@/test/renderApp';
import type { Perfil } from './api';
import { createFakeEquipe } from './testing/fakeEquipe';

vi.mock('@/lib/supabase', async () => ({
  supabase: (await import('@/test/supabaseMock')).fakeSupabase.client,
}));

const equipe = createFakeEquipe();
const categorias = createFakeCategoriasTable();

const perfil = (p: Omit<Perfil, 'gerente_id'> & { gerente_id?: string | null }): Perfil => ({
  gerente_id: null,
  ...p,
});

const MARIA = perfil({
  id: 'u-maria',
  nome: 'Maria',
  username: 'maria',
  role: 'gerente',
  ativo: true,
});
const JOAO = perfil({
  id: 'u-joao',
  nome: 'João',
  username: 'joao',
  role: 'user',
  ativo: true,
  gerente_id: 'u-maria',
});
const ANA = perfil({
  id: 'u-ana',
  nome: 'Ana',
  username: 'ana',
  role: 'user',
  ativo: true,
  gerente_id: 'u-maria',
});
const GIL = perfil({ id: 'u-gil', nome: 'Gil', username: 'gil', role: 'gerente', ativo: true });
const ADM = perfil({ id: 'u-adm', nome: 'Adm', username: 'adm', role: 'admin', ativo: true });

async function linhas() {
  const lista = await screen.findByRole('list', { name: 'Por atendente' });
  return within(lista).getAllByTestId('equipe-item');
}

const acoes = (nome: string) => screen.queryByRole('button', { name: `Ações de ${nome}` });

async function redefinir(nome: string, senha: string) {
  const user = userEvent.setup();
  await user.click(acoes(nome)!);
  const menu = screen.getByRole('dialog', { name: nome });
  await user.click(within(menu).getByRole('button', { name: 'Redefinir senha' }));
  const sheet = screen.getByRole('dialog', { name: 'Redefinir senha' });
  await user.type(within(sheet).getByLabelText('Nova senha'), senha);
  await user.type(within(sheet).getByLabelText('Confirmar nova senha'), senha);
  await user.click(within(sheet).getByRole('button', { name: 'Salvar senha' }));
  return sheet;
}

describe('Equipe: Redefinir senha (spec 010)', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date(2026, 10, 20, 12, 0, 0));
    fakeSupabase.reset();
    equipe.reset();
    categorias.reset();
    fakeSupabase.setTableHandler('categorias', categorias.handler);
    equipe.register(fakeSupabase);
  });

  afterEach(() => vi.useRealTimers());

  it('gerente: ⋮ só nas linhas de atendente (nunca em si mesmo nem em gerente/admin)', async () => {
    // A RPC real só devolve Maria + atendentes dela; Gil e Adm entram aqui para
    // garantir que a ação depende do papel da linha.
    equipe.seed({ perfis: [MARIA, JOAO, ANA, GIL, ADM], lancamentos: [] });
    fakeSupabase.setPersistedSession(makeProfile(MARIA));
    renderApp('/equipe');
    expect(await linhas()).toHaveLength(5);

    expect(acoes('João')).toBeInTheDocument();
    expect(acoes('Ana')).toBeInTheDocument();
    expect(acoes('Maria')).not.toBeInTheDocument();
    expect(acoes('Gil')).not.toBeInTheDocument();
    expect(acoes('Adm')).not.toBeInTheDocument();
  });

  it('gerente redefine a senha do atendente: nova + confirmação → reset_password', async () => {
    equipe.seed({ perfis: [MARIA, JOAO, ANA], lancamentos: [] });
    fakeSupabase.setPersistedSession(makeProfile(MARIA));
    renderApp('/equipe');
    await linhas();

    await redefinir('João', 'nova123');
    expect(fakeSupabase.functions.invoke).toHaveBeenCalledWith('admin-users', {
      body: { action: 'reset_password', user_id: 'u-joao', password: 'nova123' },
    });
    expect(await screen.findByRole('status')).toHaveTextContent('Senha de joao redefinida.');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('confirmação diferente não chama a função', async () => {
    equipe.seed({ perfis: [MARIA, JOAO], lancamentos: [] });
    fakeSupabase.setPersistedSession(makeProfile(MARIA));
    renderApp('/equipe');
    await linhas();
    const user = userEvent.setup();
    await user.click(acoes('João')!);
    await user.click(screen.getByRole('button', { name: 'Redefinir senha' }));
    const sheet = screen.getByRole('dialog', { name: 'Redefinir senha' });
    await user.type(within(sheet).getByLabelText('Nova senha'), 'nova123');
    await user.type(within(sheet).getByLabelText('Confirmar nova senha'), 'nova124');
    await user.click(within(sheet).getByRole('button', { name: 'Salvar senha' }));
    expect(within(sheet).getByText('As senhas não conferem.')).toBeInTheDocument();
    expect(fakeSupabase.functions.invoke).not.toHaveBeenCalled();
  });

  it('403 da função ("Acesso negado") aparece no sheet', async () => {
    fakeSupabase.functions.invoke.mockResolvedValue({
      data: null,
      error: new FunctionsHttpError(
        new Response(JSON.stringify({ error: 'Acesso negado' }), {
          status: 403,
          headers: { 'Content-Type': 'application/json' },
        }),
      ),
    });
    equipe.seed({ perfis: [MARIA, JOAO], lancamentos: [] });
    fakeSupabase.setPersistedSession(makeProfile(MARIA));
    renderApp('/equipe');
    await linhas();
    const sheet = await redefinir('João', 'nova123');
    expect(await within(sheet).findByRole('alert')).toHaveTextContent('Acesso negado');
  });

  it('admin: ⋮ em todos menos ele mesmo, inclusive gerentes', async () => {
    equipe.seed({ perfis: [ADM, MARIA, JOAO, GIL], lancamentos: [] });
    fakeSupabase.setPersistedSession(makeProfile(ADM));
    renderApp('/equipe');
    await linhas();
    expect(acoes('Adm')).not.toBeInTheDocument();
    expect(acoes('Maria')).toBeInTheDocument();
    expect(acoes('João')).toBeInTheDocument();
    expect(acoes('Gil')).toBeInTheDocument();

    await redefinir('Maria', 'outra99');
    expect(fakeSupabase.functions.invoke).toHaveBeenCalledWith('admin-users', {
      body: { action: 'reset_password', user_id: 'u-maria', password: 'outra99' },
    });
  });

  it('atendente na lista aparece sem selo de papel e a seção se chama "Por atendente"', async () => {
    equipe.seed({ perfis: [MARIA, JOAO], lancamentos: [] });
    fakeSupabase.setPersistedSession(makeProfile(MARIA));
    renderApp('/equipe');
    const [primeira, segunda] = await linhas();
    expect([primeira, segunda].map((li) => li?.textContent ?? '').join(' ')).not.toMatch(
      /entregador/i,
    );
    expect(screen.getByRole('heading', { name: 'Por atendente' })).toBeInTheDocument();
  });
});
