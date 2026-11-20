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
  gerente_id: null,
};
const maria: AdminUser = {
  id: 'u-maria',
  nome: 'Maria',
  username: 'maria',
  role: 'user',
  ativo: false,
  gerente_id: null,
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
    role: 'admin',
    isAdmin: true,
    isGerente: false,
    isGestor: true,
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
      {
        id: admin.id,
        nome: admin.nome,
        username: admin.username,
        role: 'admin',
        ativo: true,
        gerente_id: null,
      },
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
    expect(items[1]).toHaveTextContent('Atendente');
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
      body: {
        action: 'create',
        nome: 'Pedro',
        username: 'pedro.s',
        password: '123456',
        role: 'user',
      },
    });
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(await screen.findByRole('status')).toHaveTextContent('Usuário pedro.s criado.');
  });

  it('cria um gerente pelo select "Papel" (Atendente é o padrão)', async () => {
    renderPage();
    const { user, dialog } = await openNewUser();
    const papel = within(dialog).getByLabelText('Papel');
    expect(papel).toHaveValue('user');
    expect(
      within(papel)
        .getAllByRole('option')
        .map((o) => o.textContent),
    ).toEqual(['Atendente', 'Gerente', 'Admin']);
    await user.type(within(dialog).getByLabelText('Nome'), 'Maria');
    await user.type(within(dialog).getByLabelText('Usuário'), 'maria2');
    await user.type(within(dialog).getByLabelText('Senha'), '123456');
    await user.selectOptions(papel, 'gerente');
    await user.click(within(dialog).getByRole('button', { name: 'Criar' }));

    expect(mock.invoke).toHaveBeenCalledWith('admin-users', {
      body: {
        action: 'create',
        nome: 'Maria',
        username: 'maria2',
        password: '123456',
        role: 'gerente',
      },
    });
  });

  it('menu de papel: gerente, admin e atendente, com confirmação', async () => {
    mock.users = [
      ...mock.users,
      { id: 'u-gil', nome: 'Gil', username: 'gil', role: 'gerente', ativo: true, gerente_id: null },
    ];
    const user = userEvent.setup();
    renderPage();
    const list = await screen.findByRole('list', { name: 'Usuários' });
    const gil = within(list)
      .getAllByRole('listitem')
      .find((li) => within(li).queryByText('Gil'));
    expect(gil).toHaveTextContent('Gerente');

    // Atendente: pode virar gerente ou admin.
    await user.click(screen.getByRole('button', { name: 'Ações de João Silva' }));
    expect(screen.getByRole('button', { name: 'Tornar gerente' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Tornar admin' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Tornar atendente' })).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Tornar gerente' }));
    const confirm = screen.getByRole('alertdialog', { name: 'Tornar João Silva gerente?' });
    expect(mock.invoke).not.toHaveBeenCalled();
    await user.click(within(confirm).getByRole('button', { name: 'Tornar gerente' }));
    expect(mock.invoke).toHaveBeenCalledWith('admin-users', {
      body: { action: 'set_role', user_id: 'u-joao', role: 'gerente' },
    });
    expect(await screen.findByRole('status')).toHaveTextContent('João Silva agora é gerente.');
    await waitFor(() => expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument());

    // Gerente: pode virar admin ou atendente.
    await user.click(screen.getByRole('button', { name: 'Ações de Gil' }));
    expect(screen.queryByRole('button', { name: 'Tornar gerente' })).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Tornar atendente' }));
    await user.click(
      within(screen.getByRole('alertdialog', { name: 'Tornar Gil atendente?' })).getByRole(
        'button',
        { name: 'Tornar atendente' },
      ),
    );
    expect(mock.invoke).toHaveBeenLastCalledWith('admin-users', {
      body: { action: 'set_role', user_id: 'u-gil', role: 'user' },
    });
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
    await user.type(within(sheet).getByLabelText('Confirmar nova senha'), '654320');
    await user.click(within(sheet).getByRole('button', { name: 'Salvar senha' }));
    expect(within(sheet).getByText('As senhas não conferem.')).toBeInTheDocument();
    expect(mock.invoke).toHaveBeenCalledTimes(1);

    await user.clear(within(sheet).getByLabelText('Confirmar nova senha'));
    await user.type(within(sheet).getByLabelText('Confirmar nova senha'), '654321');
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

describe('UsuariosPage — atendentes por gerente (spec 010)', () => {
  const gil: AdminUser = {
    id: 'u-gil',
    nome: 'Gil Gerente',
    username: 'gil',
    role: 'gerente',
    ativo: true,
    gerente_id: null,
  };
  const lia: AdminUser = {
    id: 'u-lia',
    nome: 'Lia Inativa',
    username: 'lia',
    role: 'gerente',
    ativo: false,
    gerente_id: null,
  };
  const bia: AdminUser = {
    id: 'u-bia',
    nome: 'Bia',
    username: 'bia',
    role: 'user',
    ativo: true,
    gerente_id: 'u-gil',
  };

  beforeEach(() => {
    mock.users = [
      {
        id: admin.id,
        nome: admin.nome,
        username: admin.username,
        role: 'admin',
        ativo: true,
        gerente_id: null,
      },
      bia,
      gil,
      { ...joao, gerente_id: 'u-gil' },
      lia,
      maria,
    ];
    mock.invoke.mockReset();
    mock.invoke.mockResolvedValue({ data: { ok: true }, error: null });
  });

  const linha = async (nome: string) => {
    const list = await screen.findByRole('list', { name: 'Usuários' });
    const li = within(list)
      .getAllByRole('listitem')
      .find((item) => within(item).queryByText(nome));
    if (!li) throw new Error(`linha ${nome} não encontrada`);
    return li;
  };

  it('atendente mostra "Gerente: X" ou "Sem gerente"; gerente mostra "N atendentes"', async () => {
    renderPage();
    expect(await linha('João Silva')).toHaveTextContent('Gerente: Gil Gerente');
    expect(await linha('Bia')).toHaveTextContent('Gerente: Gil Gerente');
    expect(await linha('Maria')).toHaveTextContent('Sem gerente');
    expect(await linha('Gil Gerente')).toHaveTextContent('2 atendentes');
    expect(await linha('Lia Inativa')).toHaveTextContent('Sem atendentes');
    expect(within(await linha('Ana Admin')).queryByTestId('usuario-vinculo')).toBeNull();
  });

  it('selo e textos usam "Atendente" (nada de "Entregador")', async () => {
    renderPage();
    expect(await linha('Maria')).toHaveTextContent('Atendente');
    expect(document.body.textContent).not.toMatch(/entregador/i);
  });

  it('"Definir gerente…" só no menu do atendente', async () => {
    const user = userEvent.setup();
    renderPage();
    await user.click(await screen.findByRole('button', { name: 'Ações de Gil Gerente' }));
    expect(screen.queryByRole('button', { name: 'Definir gerente…' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Tornar atendente' })).toBeInTheDocument();
  });

  it('Definir gerente: lista gerentes ativos + Nenhum, marca o atual e chama set_gerente', async () => {
    const user = userEvent.setup();
    renderPage();
    await user.click(await screen.findByRole('button', { name: 'Ações de Maria' }));
    await user.click(screen.getByRole('button', { name: 'Definir gerente…' }));

    const sheet = screen.getByRole('dialog', { name: 'Definir gerente' });
    const opcoes = within(within(sheet).getByRole('list', { name: 'Gerentes' })).getAllByRole(
      'button',
    );
    // Só gerentes ATIVOS (Lia está inativa) + "Nenhum".
    expect(opcoes.map((o) => o.textContent)).toEqual([
      'Gil Gerente@gil',
      'NenhumSem gerente responsável',
    ]);
    expect(opcoes[1]).toHaveAttribute('aria-current', 'true');

    await user.click(opcoes[0]!);
    expect(mock.invoke).toHaveBeenCalledWith('admin-users', {
      body: { action: 'set_gerente', user_id: 'u-maria', gerente_id: 'u-gil' },
    });
    expect(await screen.findByRole('status')).toHaveTextContent(
      'Maria agora é atendente de Gil Gerente.',
    );
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  });

  it('Definir gerente "Nenhum" envia gerente_id null', async () => {
    const user = userEvent.setup();
    renderPage();
    await user.click(await screen.findByRole('button', { name: 'Ações de João Silva' }));
    await user.click(screen.getByRole('button', { name: 'Definir gerente…' }));
    const sheet = screen.getByRole('dialog', { name: 'Definir gerente' });
    expect(within(sheet).getByRole('button', { name: /Gil Gerente/ })).toHaveAttribute(
      'aria-current',
      'true',
    );
    await user.click(within(sheet).getByRole('button', { name: /Nenhum/ }));
    expect(mock.invoke).toHaveBeenCalledWith('admin-users', {
      body: { action: 'set_gerente', user_id: 'u-joao', gerente_id: null },
    });
    expect(await screen.findByRole('status')).toHaveTextContent('João Silva ficou sem gerente.');
  });

  it('Definir gerente: erro 400 da função aparece no sheet', async () => {
    mock.invoke.mockResolvedValue(
      httpError(400, 'O gerente informado precisa ser um gerente ativo.'),
    );
    const user = userEvent.setup();
    renderPage();
    await user.click(await screen.findByRole('button', { name: 'Ações de Maria' }));
    await user.click(screen.getByRole('button', { name: 'Definir gerente…' }));
    const sheet = screen.getByRole('dialog', { name: 'Definir gerente' });
    await user.click(within(sheet).getByRole('button', { name: /Gil Gerente/ }));
    expect(await within(sheet).findByRole('alert')).toHaveTextContent(
      'O gerente informado precisa ser um gerente ativo.',
    );
  });

  it('Novo usuário: "Gerente responsável" só para Atendente e vai no create', async () => {
    renderPage();
    const { user, dialog } = await openNewUser();
    const select = within(dialog).getByLabelText('Gerente responsável');
    expect(
      within(select)
        .getAllByRole('option')
        .map((o) => o.textContent),
    ).toEqual(['Nenhum', 'Gil Gerente']);

    await user.selectOptions(within(dialog).getByLabelText('Papel'), 'gerente');
    expect(within(dialog).queryByLabelText('Gerente responsável')).not.toBeInTheDocument();
    await user.selectOptions(within(dialog).getByLabelText('Papel'), 'user');

    await user.type(within(dialog).getByLabelText('Nome'), 'Caio');
    await user.type(within(dialog).getByLabelText('Usuário'), 'caio');
    await user.type(within(dialog).getByLabelText('Senha'), '123456');
    await user.selectOptions(within(dialog).getByLabelText('Gerente responsável'), 'u-gil');
    await user.click(within(dialog).getByRole('button', { name: 'Criar' }));

    expect(mock.invoke).toHaveBeenCalledWith('admin-users', {
      body: {
        action: 'create',
        nome: 'Caio',
        username: 'caio',
        password: '123456',
        role: 'user',
        gerente_id: 'u-gil',
      },
    });
  });

  it('Novo usuário: o gerente escolhido não vai junto se o papel virar Gerente', async () => {
    renderPage();
    const { user, dialog } = await openNewUser();
    await user.type(within(dialog).getByLabelText('Nome'), 'Caio');
    await user.type(within(dialog).getByLabelText('Usuário'), 'caio');
    await user.type(within(dialog).getByLabelText('Senha'), '123456');
    await user.selectOptions(within(dialog).getByLabelText('Gerente responsável'), 'u-gil');
    await user.selectOptions(within(dialog).getByLabelText('Papel'), 'gerente');
    await user.click(within(dialog).getByRole('button', { name: 'Criar' }));
    const body = (mock.invoke.mock.calls[0]?.[1] as { body: Record<string, unknown> }).body;
    expect(body).not.toHaveProperty('gerente_id');
    expect(body.role).toBe('gerente');
  });

  it('Novo usuário: 400 sobre o gerente aparece abaixo do select', async () => {
    mock.invoke.mockResolvedValue(
      httpError(400, 'O gerente informado precisa ser um gerente ativo.'),
    );
    renderPage();
    const { user, dialog } = await openNewUser();
    await user.type(within(dialog).getByLabelText('Nome'), 'Caio');
    await user.type(within(dialog).getByLabelText('Usuário'), 'caio');
    await user.type(within(dialog).getByLabelText('Senha'), '123456');
    await user.selectOptions(within(dialog).getByLabelText('Gerente responsável'), 'u-gil');
    await user.click(within(dialog).getByRole('button', { name: 'Criar' }));
    expect(
      await within(dialog).findByText('O gerente informado precisa ser um gerente ativo.'),
    ).toBeInTheDocument();
    expect(within(dialog).getByLabelText('Gerente responsável')).toHaveAttribute(
      'aria-invalid',
      'true',
    );
  });
});
