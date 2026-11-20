import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fakeSupabase, makeProfile } from '@/test/supabaseMock';
import { renderApp } from '@/test/renderApp';
import { changePasswordSchema } from './schemas';

vi.mock('@/lib/supabase', async () => ({
  supabase: (await import('@/test/supabaseMock')).fakeSupabase.client,
}));

const JOAO = makeProfile({ id: 'u-joao', nome: 'João Silva', username: 'joao', role: 'user' });
const MARIA = { id: 'u-maria', nome: 'Maria Souza', username: 'maria' };

function semGerente() {
  fakeSupabase.setRpcHandler('meu_gerente', () => ({ data: [], error: null }));
}

async function abrirConta(profile = JOAO) {
  fakeSupabase.addAccount(profile.username, 'segredo', profile);
  fakeSupabase.setPersistedSession(profile);
  renderApp('/conta');
  expect(await screen.findByRole('heading', { level: 1, name: 'Minha conta' })).toBeInTheDocument();
  return userEvent.setup();
}

async function preencher(
  user: ReturnType<typeof userEvent.setup>,
  { atual, nova, confirmacao }: { atual: string; nova: string; confirmacao: string },
) {
  if (atual) await user.type(screen.getByLabelText('Senha atual'), atual);
  if (nova) await user.type(screen.getByLabelText('Nova senha'), nova);
  if (confirmacao) await user.type(screen.getByLabelText('Confirmar nova senha'), confirmacao);
  await user.click(screen.getByRole('button', { name: 'Salvar nova senha' }));
}

describe('Minha conta (spec 010)', () => {
  beforeEach(() => {
    fakeSupabase.reset();
  });

  it('o ícone "Minha conta" do cabeçalho, ao lado do Sair, abre /conta', async () => {
    semGerente();
    fakeSupabase.setPersistedSession(JOAO);
    renderApp('/');
    await screen.findByRole('heading', { level: 1, name: 'Lançar' });
    const user = userEvent.setup();
    expect(screen.getByRole('button', { name: 'Sair' })).toBeInTheDocument();
    await user.click(screen.getByRole('link', { name: 'Minha conta' }));
    expect(
      await screen.findByRole('heading', { level: 1, name: 'Minha conta' }),
    ).toBeInTheDocument();
  });

  it('mostra nome, @usuário, papel "Atendente" e o gerente vindo de meu_gerente', async () => {
    fakeSupabase.setRpcHandler('meu_gerente', () => ({ data: [MARIA], error: null }));
    await abrirConta();
    expect(screen.getByText('João Silva')).toBeInTheDocument();
    expect(screen.getByText('@joao')).toBeInTheDocument();
    expect(screen.getByText('Atendente')).toBeInTheDocument();
    expect(await screen.findByTestId('conta-gerente')).toHaveTextContent('Gerente: Maria Souza');
    expect(fakeSupabase.rpc).toHaveBeenCalledWith('meu_gerente');
  });

  it('atendente sem gerente mostra "Sem gerente"', async () => {
    semGerente();
    await abrirConta();
    expect(await screen.findByTestId('conta-gerente')).toHaveTextContent('Sem gerente');
  });

  it('gerente vê o selo "Gerente" e nenhuma linha de gerente', async () => {
    semGerente();
    await abrirConta(makeProfile({ id: 'u-g', nome: 'Gil', username: 'gil', role: 'gerente' }));
    expect(screen.getByText('Gerente')).toBeInTheDocument();
    await waitFor(() => expect(fakeSupabase.rpc).toHaveBeenCalledWith('meu_gerente'));
    expect(screen.queryByTestId('conta-gerente')).not.toBeInTheDocument();
  });

  it('valida sem chamar o servidor: campos vazios, mínimo de 6, confirmação e nova = atual', async () => {
    semGerente();
    const user = await abrirConta();

    await user.click(screen.getByRole('button', { name: 'Salvar nova senha' }));
    expect(screen.getByText('Informe a senha atual.')).toBeInTheDocument();
    expect(screen.getByText('A senha precisa ter pelo menos 6 caracteres.')).toBeInTheDocument();

    await preencher(user, { atual: 'segredo', nova: 'segredo', confirmacao: 'outra1' });
    expect(screen.getByText('A nova senha precisa ser diferente da atual.')).toBeInTheDocument();
    expect(screen.getByText('As senhas não conferem.')).toBeInTheDocument();
    expect(screen.getByLabelText('Confirmar nova senha')).toHaveAttribute('aria-invalid', 'true');

    expect(fakeSupabase.auth.signInWithPassword).not.toHaveBeenCalled();
    expect(fakeSupabase.auth.updateUser).not.toHaveBeenCalled();
  });

  it('senha atual errada: "Senha atual incorreta." e não troca', async () => {
    semGerente();
    const user = await abrirConta();
    await preencher(user, { atual: 'errada', nova: 'nova123', confirmacao: 'nova123' });

    expect(await screen.findByText('Senha atual incorreta.')).toBeInTheDocument();
    expect(screen.getByLabelText('Senha atual')).toHaveAttribute('aria-invalid', 'true');
    expect(fakeSupabase.auth.signInWithPassword).toHaveBeenCalledWith({
      email: 'joao@entregas.local',
      password: 'errada',
    });
    expect(fakeSupabase.auth.updateUser).not.toHaveBeenCalled();
    expect(fakeSupabase.passwordOf('joao')).toBe('segredo');
  });

  it('sucesso: confere a atual, grava a nova, toast "Senha alterada." e limpa os campos', async () => {
    semGerente();
    const user = await abrirConta();
    await preencher(user, { atual: 'segredo', nova: 'nova123', confirmacao: 'nova123' });

    expect(await screen.findByRole('status')).toHaveTextContent('Senha alterada.');
    expect(fakeSupabase.auth.signInWithPassword).toHaveBeenCalledWith({
      email: 'joao@entregas.local',
      password: 'segredo',
    });
    expect(fakeSupabase.auth.updateUser).toHaveBeenCalledWith({ password: 'nova123' });
    expect(fakeSupabase.passwordOf('joao')).toBe('nova123');
    expect(screen.getByLabelText('Senha atual')).toHaveValue('');
    expect(screen.getByLabelText('Nova senha')).toHaveValue('');
    expect(screen.getByLabelText('Confirmar nova senha')).toHaveValue('');
    // Continua logado na mesma tela.
    expect(screen.getByRole('heading', { level: 1, name: 'Minha conta' })).toBeInTheDocument();
  });

  it.each([
    ['weak_password', 'Senha fraca. Escolha outra, com pelo menos 6 caracteres.'],
    ['same_password', 'A nova senha precisa ser diferente da atual.'],
  ])('erro %s do Supabase vira mensagem amigável abaixo da nova senha', async (code, msg) => {
    semGerente();
    const user = await abrirConta();
    fakeSupabase.failNextUpdateUser(code);
    await preencher(user, { atual: 'segredo', nova: 'nova123', confirmacao: 'nova123' });

    const nova = screen.getByLabelText('Nova senha');
    await waitFor(() => expect(nova).toHaveAttribute('aria-invalid', 'true'));
    expect(within(nova.closest('div')!.parentElement!).getByText(msg)).toBeInTheDocument();
    expect(fakeSupabase.passwordOf('joao')).toBe('segredo');
  });
});

describe('changePasswordSchema', () => {
  it('aceita nova ≥ 6, igual à confirmação e diferente da atual', () => {
    expect(
      changePasswordSchema.safeParse({ atual: 'abc', nova: '123456', confirmacao: '123456' })
        .success,
    ).toBe(true);
  });

  it('recusa nova com menos de 6 caracteres', () => {
    const r = changePasswordSchema.safeParse({ atual: 'abc', nova: '12345', confirmacao: '12345' });
    expect(r.error?.issues.map((i) => i.path[0])).toEqual(['nova']);
  });
});
