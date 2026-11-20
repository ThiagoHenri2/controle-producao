import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fakeSupabase, makeProfile } from '@/test/supabaseMock';
import { renderApp } from '@/test/renderApp';

vi.mock('@/lib/supabase', async () => ({
  supabase: (await import('@/test/supabaseMock')).fakeSupabase.client,
}));

const findHeading = (name: string) => screen.findByRole('heading', { level: 1, name });

describe('ProtectedRoute / AdminRoute / Sair', () => {
  beforeEach(() => {
    fakeSupabase.reset();
  });

  it('sem sessão, rotas protegidas vão para /login', async () => {
    renderApp('/relatorio');
    expect(await screen.findByLabelText('Usuário')).toBeInTheDocument();
    expect(screen.queryByRole('navigation')).not.toBeInTheDocument();
  });

  it('sessão persistida mantém o usuário logado ao reabrir', async () => {
    fakeSupabase.setPersistedSession(makeProfile());
    renderApp('/categorias');
    expect(await findHeading('Categorias')).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Usuários' })).not.toBeInTheDocument();
  });

  it('user comum em /admin/usuarios é mandado para /', async () => {
    fakeSupabase.setPersistedSession(makeProfile());
    renderApp('/admin/usuarios');
    expect(await findHeading('Lançar')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Novo usuário' })).not.toBeInTheDocument();
  });

  it('admin acessa /admin/usuarios e vê o item na BottomNav', async () => {
    fakeSupabase.setPersistedSession(makeProfile({ role: 'admin' }));
    renderApp('/admin/usuarios');
    expect(await screen.findByRole('button', { name: 'Novo usuário' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Usuários' })).toBeInTheDocument();
  });

  it('usuário já logado que abre /login vai para /', async () => {
    fakeSupabase.setPersistedSession(makeProfile());
    renderApp('/login');
    expect(await findHeading('Lançar')).toBeInTheDocument();
  });

  it('sessão persistida de usuário desativado é encerrada', async () => {
    fakeSupabase.setPersistedSession(makeProfile({ ativo: false }));
    renderApp('/');
    expect(await screen.findByLabelText('Usuário')).toBeInTheDocument();
    await waitFor(() => expect(fakeSupabase.auth.signOut).toHaveBeenCalled());
  });

  it('botão Sair encerra a sessão, limpa o cache e volta para /login', async () => {
    const user = userEvent.setup();
    fakeSupabase.setPersistedSession(makeProfile());
    const { queryClient } = renderApp('/');
    await findHeading('Lançar');
    expect(queryClient.getQueryCache().getAll().length).toBeGreaterThan(0);

    await user.click(screen.getByRole('button', { name: 'Sair' }));

    expect(await screen.findByLabelText('Usuário')).toBeInTheDocument();
    expect(fakeSupabase.auth.signOut).toHaveBeenCalledTimes(1);
    expect(queryClient.getQueryCache().getAll()).toHaveLength(0);
  });
});
