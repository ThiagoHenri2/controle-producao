import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClientProvider } from '@tanstack/react-query';
import { FunctionsHttpError } from '@supabase/supabase-js';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ToastProvider } from '@/components/ui';
import { AuthContext, type AuthContextValue } from '@/features/auth/auth-context';
import { createQueryClient } from '@/lib/queryClient';
import { makeProfile } from '@/test/supabaseMock';
import type { AdminUser } from './api';
import { UsuariosPage } from './UsuariosPage';

// Supabase falso local: só o que a tela de admin usa.
const mock = vi.hoisted(() => ({
  users: [] as AdminUser[],
  invoke: vi.fn(),
}));

vi.mock('@/lib/supabase', () => {
  return {
    supabase: {
      from: (table: string) => ({
        select: () => ({
          order: async () => {
            if (table !== 'profiles') throw new Error(`Tabela não simulada: ${table}`);
            return { data: [...mock.users], error: null };
          },
        }),
      }),
      functions: { invoke: (...args: unknown[]) => mock.invoke(...args) },
    },
  };
});

const admin = makeProfile({ id: 'admin-1', nome: 'Ana Admin', username: 'ana', role: 'admin' });
const joao: AdminUser = {
  id: 'u-joao',
  nome: 'João Silva',
  username: 'joao',
  role: 'user',
  ativo: true,
};
const maria: AdminUser = {
  id: 'u-maria',
  nome: 'Maria',
  username: 'maria',
  role: 'user',
  ativo: false,
};

function httpError(status: number, error: string) {
  return {
    data: null,
    error: new FunctionsHttpError(
      new Response(JSON.stringify({ error }), {
        status,
        headers: { 'Content-Type': 'application/json' },
      }),
    ),
  };
}

function renderPage() {
  const queryClient = createQueryClient();
  queryClient.setDefaultOptions({ queries: { retry: false }, mutations: { retry: false } });
  const auth: AuthContextValue = {
    session: null,
    profile: admin,
    isAuthenticated: true,
    isAdmin: true,
    loading: false,
    signIn: vi.fn(),
    signOut: vi.fn(),
  };
  return render(
    <QueryClientProvider client={queryClient}>
      <ToastProvider>
        <AuthContext.Provider value={auth}>
          <UsuariosPage />
        </AuthContext.Provider>
      </ToastProvider>
    </QueryClientProvider>,
  );
}

async function openNewUser() {
  const user = userEvent.setup();
  await user.click(await screen.findByRole('button', { name: 'Novo usuário' }));
  const dialog = screen.getByRole('dialog', { name: 'Novo usuário' });
  return { user, dialog };
}

describe('UsuariosPage', () => {
  beforeEach(() => {
    mock.users = [
      { id: admin.id, nome: admin.nome, username: admin.username, role: 'admin', ativo: true },
      joao,
      maria,
    ];
    mock.invoke.mockReset();
    mock.invoke.mockResolvedValue({ data: { ok: true }, error: null });
  });

  it('lista nome, @usuário, papel e ativo/inativo', async () => {
    renderPage();
    const list = await screen.findByRole('list', { name: 'Usuários' });
    const items = within(list).getAllByRole('listitem');
    expect(items).toHaveLength(3);
    expect(items[1]).toHaveTextContent('João Silva');
    expect(items[1]).toHaveTextContent('@joao');
    expect(items[1]).toHaveTextContent('Usuário');
    expect(items[1]).toHaveTextContent('Ativo');
    expect(items[2]).toHaveTextContent('Inativo');
    expect(items[0]).toHaveTextContent('Admin');
  });

  it('esconde as ações sobre o próprio admin logado', async () => {
    renderPage();
    await screen.findByRole('list', { name: 'Usuários' });
    expect(screen.queryByRole('button', { name: 'Ações de Ana Admin' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Ações de João Silva' })).toBeInTheDocument();
  });

  it('valida o formulário sem chamar o servidor', async () => {
    renderPage();
    const { user, dialog } = await openNewUser();
    await user.type(within(dialog).getByLabelText('Usuário'), 'jo');
    await user.type(within(dialog).getByLabelText('Senha'), '123');
    await user.click(within(dialog).getByRole('button', { name: 'Criar' }));
    expect(within(dialog).getByText('Informe o nome.')).toBeInTheDocument();
    expect(
      within(dialog).getByText(
        'Use de 3 a 30 caracteres: letras minúsculas, números, ponto, hífen ou _.',
      ),
    ).toBeInTheDocument();
    expect(
      within(dialog).getByText('A senha precisa ter pelo menos 6 caracteres.'),
    ).toBeInTheDocument();
    expect(mock.invoke).not.toHaveBeenCalled();
  });

  it('mostra o login normalizado e cria o usuário', async () => {
    renderPage();
    const { user, dialog } = await openNewUser();
    await user.type(within(dialog).getByLabelText('Nome'), 'Pedro');
    await user.type(within(dialog).getByLabelText('Usuário'), ' Pedro.S ');
    expect(within(dialog).getByText('O login do usuário será: pedro.s')).toBeInTheDocument();
    const senha = within(dialog).getByLabelText('Senha');
    await user.type(senha, '123456');
    await user.click(within(dialog).getByRole('button', { name: 'Mostrar senha' }));
    expect(senha).toHaveAttribute('type', 'text');
    await user.click(within(dialog).getByRole('button', { name: 'Criar' }));

    expect(mock.invoke).toHaveBeenCalledWith('admin-users', {
      body: { action: 'create', nome: 'Pedro', username: 'pedro.s', password: '123456' },
    });
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(await screen.findByRole('status')).toHaveTextContent('Usuário pedro.s criado.');
  });

  it('409 mostra "Usuário já existe" abaixo do campo e mantém o formulário', async () => {
    mock.invoke.mockResolvedValue(httpError(409, 'Usuário já existe'));
    renderPage();
    const { user, dialog } = await openNewUser();
    await user.type(within(dialog).getByLabelText('Nome'), 'João');
    await user.type(within(dialog).getByLabelText('Usuário'), 'joao');
    await user.type(within(dialog).getByLabelText('Senha'), '123456');
    await user.click(within(dialog).getByRole('button', { name: 'Criar' }));

    expect(await within(dialog).findByText('Usuário já existe')).toBeInTheDocument();
    expect(within(dialog).getByLabelText('Usuário')).toHaveAttribute('aria-invalid', 'true');
    expect(screen.getByRole('dialog', { name: 'Novo usuário' })).toBeInTheDocument();
  });

  it('403 mostra "Acesso negado"', async () => {
    mock.invoke.mockResolvedValue(httpError(403, 'Acesso negado'));
    renderPage();
    const { user, dialog } = await openNewUser();
    await user.type(within(dialog).getByLabelText('Nome'), 'Pedro');
    await user.type(within(dialog).getByLabelText('Usuário'), 'pedro');
    await user.type(within(dialog).getByLabelText('Senha'), '123456');
    await user.click(within(dialog).getByRole('button', { name: 'Criar' }));
    expect(await within(dialog).findByRole('alert')).toHaveTextContent('Acesso negado');
  });

  it('"Tornar admin" pede confirmação antes de chamar a função', async () => {
    const user = userEvent.setup();
    renderPage();
    await user.click(await screen.findByRole('button', { name: 'Ações de João Silva' }));
    await user.click(screen.getByRole('button', { name: 'Tornar admin' }));

    const confirm = screen.getByRole('alertdialog', { name: 'Tornar João Silva admin?' });
    expect(mock.invoke).not.toHaveBeenCalled();

    // Cancelar não chama nada.
    await user.click(within(confirm).getByRole('button', { name: 'Cancelar' }));
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
    expect(mock.invoke).not.toHaveBeenCalled();

    await user.click(screen.getByRole('button', { name: 'Ações de João Silva' }));
    await user.click(screen.getByRole('button', { name: 'Tornar admin' }));
    await user.click(
      within(screen.getByRole('alertdialog')).getByRole('button', { name: 'Tornar admin' }),
    );
    expect(mock.invoke).toHaveBeenCalledWith('admin-users', {
      body: { action: 'set_role', user_id: 'u-joao', role: 'admin' },
    });
    expect(await screen.findByRole('status')).toHaveTextContent('João Silva agora é admin.');
  });

  it('403 numa ação do menu aparece em um aviso de erro', async () => {
    mock.invoke.mockResolvedValue(httpError(403, 'Acesso negado'));
    const user = userEvent.setup();
    renderPage();
    await user.click(await screen.findByRole('button', { name: 'Ações de João Silva' }));
    await user.click(screen.getByRole('button', { name: 'Desativar' }));
    const confirm = screen.getByRole('alertdialog', { name: 'Desativar João Silva?' });
    await user.click(within(confirm).getByRole('button', { name: 'Desativar' }));
    expect(mock.invoke).toHaveBeenCalledWith('admin-users', {
      body: { action: 'set_active', user_id: 'u-joao', ativo: false },
    });
    expect(await screen.findByRole('alert')).toHaveTextContent('Acesso negado');
  });

  it('reativa usuário inativo e redefine senha', async () => {
    const user = userEvent.setup();
    renderPage();
    await user.click(await screen.findByRole('button', { name: 'Ações de Maria' }));
    await user.click(screen.getByRole('button', { name: 'Reativar' }));
    await user.click(
      within(screen.getByRole('alertdialog')).getByRole('button', { name: 'Reativar' }),
    );
    expect(mock.invoke).toHaveBeenCalledWith('admin-users', {
      body: { action: 'set_active', user_id: 'u-maria', ativo: true },
    });
    await waitFor(() => expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument());

    await user.click(screen.getByRole('button', { name: 'Ações de Maria' }));
    await user.click(screen.getByRole('button', { name: 'Redefinir senha' }));
    const sheet = screen.getByRole('dialog', { name: 'Redefinir senha' });
    await user.type(within(sheet).getByLabelText('Nova senha'), '654321');
    await user.click(within(sheet).getByRole('button', { name: 'Salvar senha' }));
    expect(mock.invoke).toHaveBeenLastCalledWith('admin-users', {
      body: { action: 'reset_password', user_id: 'u-maria', password: '654321' },
    });
  });

  it('não exibe valores em R$ de ninguém', async () => {
    renderPage();
    await screen.findByRole('list', { name: 'Usuários' });
    expect(document.body.textContent).not.toMatch(/R\$/);
  });
});
