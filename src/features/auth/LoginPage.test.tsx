import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fakeSupabase, makeProfile } from '@/test/supabaseMock';
import { renderApp } from '@/test/renderApp';

vi.mock('@/lib/supabase', async () => ({
  supabase: (await import('@/test/supabaseMock')).fakeSupabase.client,
}));

async function fillAndSubmit(username: string, password: string) {
  const user = userEvent.setup();
  await user.type(await screen.findByLabelText('Usuário'), username);
  await user.type(screen.getByLabelText('Senha'), password);
  await user.click(screen.getByRole('button', { name: 'Entrar' }));
  return user;
}

describe('LoginPage', () => {
  beforeEach(() => {
    fakeSupabase.reset();
    fakeSupabase.addAccount('joao', 'segredo', makeProfile());
  });

  it('tem os atributos de teclado do wireframe', async () => {
    renderApp('/login');
    const usuario = await screen.findByLabelText('Usuário');
    expect(usuario).toHaveAttribute('autocapitalize', 'none');
    expect(usuario).toHaveAttribute('autocomplete', 'username');
    expect(screen.getByLabelText('Senha')).toHaveAttribute('type', 'password');
  });

  it('login válido leva a / usando o e-mail sintético', async () => {
    renderApp('/login');
    await fillAndSubmit(' Joao ', 'segredo');
    expect(await screen.findByRole('heading', { level: 1, name: 'Lançar' })).toBeInTheDocument();
    expect(fakeSupabase.auth.signInWithPassword).toHaveBeenCalledWith({
      email: 'joao@entregas.local',
      password: 'segredo',
    });
  });

  it('senha errada mostra a mensagem genérica', async () => {
    renderApp('/login');
    await fillAndSubmit('joao', 'errada');
    expect(await screen.findByRole('alert')).toHaveTextContent('Usuário ou senha inválidos.');
    expect(screen.getByLabelText('Senha')).toHaveValue('');
  });

  it('usuário inexistente mostra a mesma mensagem genérica', async () => {
    renderApp('/login');
    await fillAndSubmit('ninguem', 'segredo');
    expect(await screen.findByRole('alert')).toHaveTextContent('Usuário ou senha inválidos.');
  });

  it('mostra loading e desabilita o botão durante o envio', async () => {
    const release = fakeSupabase.holdSignIn();
    renderApp('/login');
    await fillAndSubmit('joao', 'errada');
    const botao = screen.getByRole('button', { name: 'Entrar' });
    expect(botao).toBeDisabled();
    expect(botao).toHaveAttribute('aria-busy', 'true');
    release();
    expect(await screen.findByRole('alert')).toHaveTextContent('Usuário ou senha inválidos.');
    expect(screen.getByRole('button', { name: 'Entrar' })).toBeEnabled();
  });

  it('usuário desativado não entra e a sessão é encerrada', async () => {
    fakeSupabase.addAccount('maria', 'segredo', makeProfile({ id: 'user-2', ativo: false }));
    renderApp('/login');
    await fillAndSubmit('maria', 'segredo');
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Usuário desativado. Fale com o administrador.',
    );
    expect(fakeSupabase.auth.signOut).toHaveBeenCalled();
    expect(screen.queryByRole('heading', { name: 'Lançar' })).not.toBeInTheDocument();
  });

  it('usuário sem perfil é tratado como desativado', async () => {
    fakeSupabase.addAccount('orfao', 'segredo', null);
    renderApp('/login');
    await fillAndSubmit('orfao', 'segredo');
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Usuário desativado. Fale com o administrador.',
    );
    expect(fakeSupabase.auth.signOut).toHaveBeenCalled();
  });

  it('valida campos vazios sem chamar o servidor', async () => {
    const user = userEvent.setup();
    renderApp('/login');
    await user.click(await screen.findByRole('button', { name: 'Entrar' }));
    expect(screen.getByText('Informe o usuário.')).toBeInTheDocument();
    expect(screen.getByText('Informe a senha.')).toBeInTheDocument();
    expect(fakeSupabase.auth.signInWithPassword).not.toHaveBeenCalled();
  });

  it('mostra e oculta a senha', async () => {
    const user = userEvent.setup();
    renderApp('/login');
    const senha = await screen.findByLabelText('Senha');
    await user.click(screen.getByRole('button', { name: 'Mostrar senha' }));
    expect(senha).toHaveAttribute('type', 'text');
    await user.click(screen.getByRole('button', { name: 'Ocultar senha' }));
    expect(senha).toHaveAttribute('type', 'password');
  });

  it('não pisca o formulário enquanto a sessão inicial é resolvida', async () => {
    fakeSupabase.holdInitialSession();
    renderApp('/login');
    expect(screen.getByRole('status', { name: 'Carregando' })).toBeInTheDocument();
    expect(screen.queryByLabelText('Usuário')).not.toBeInTheDocument();
    fakeSupabase.resolveInitial();
    await waitFor(() => expect(screen.getByLabelText('Usuário')).toBeInTheDocument());
  });
});
