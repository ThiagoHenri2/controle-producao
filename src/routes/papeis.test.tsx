import { screen, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createFakeEquipe } from '@/features/equipe/testing/fakeEquipe';
import { fakeSupabase, makeProfile } from '@/test/supabaseMock';
import { renderApp } from '@/test/renderApp';

vi.mock('@/lib/supabase', async () => ({
  supabase: (await import('@/test/supabaseMock')).fakeSupabase.client,
}));

const equipe = createFakeEquipe();
const findHeading = (name: string) => screen.findByRole('heading', { level: 1, name });

async function linksDaNav() {
  const nav = await screen.findByRole('navigation', { name: 'Navegação principal' });
  return within(nav)
    .getAllByRole('link')
    .map((l) => l.textContent);
}

describe('Papéis: BottomNav e guards (spec 008)', () => {
  beforeEach(() => {
    fakeSupabase.reset();
    equipe.reset();
    equipe.register(fakeSupabase);
  });

  it('entregador: Lançar · Relatório · Categorias; /equipe volta para Lançar', async () => {
    fakeSupabase.setPersistedSession(makeProfile());
    renderApp('/equipe');
    expect(await findHeading('Lançar')).toBeInTheDocument();
    expect(await linksDaNav()).toEqual(['Lançar', 'Relatório', 'Categorias']);
  });

  it('gerente: + Equipe, sem Usuários; acessa /equipe e não acessa /admin/usuarios', async () => {
    fakeSupabase.setPersistedSession(
      makeProfile({ id: 'u-maria', nome: 'Maria', role: 'gerente' }),
    );
    renderApp('/equipe');
    expect(await findHeading('Equipe')).toBeInTheDocument();
    expect(await linksDaNav()).toEqual(['Lançar', 'Relatório', 'Categorias', 'Equipe']);
    expect(screen.queryByRole('link', { name: 'Usuários' })).not.toBeInTheDocument();
  });

  it('gerente em /admin/usuarios é mandado para /', async () => {
    fakeSupabase.setPersistedSession(
      makeProfile({ id: 'u-maria', nome: 'Maria', role: 'gerente' }),
    );
    renderApp('/admin/usuarios');
    expect(await findHeading('Lançar')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Novo usuário' })).not.toBeInTheDocument();
  });

  it('admin: 5 itens (Equipe + Usuários) e acessa /equipe', async () => {
    fakeSupabase.setPersistedSession(makeProfile({ id: 'u-adm', nome: 'Adm', role: 'admin' }));
    renderApp('/equipe');
    expect(await findHeading('Equipe')).toBeInTheDocument();
    expect(await linksDaNav()).toEqual(['Lançar', 'Relatório', 'Categorias', 'Equipe', 'Usuários']);
  });

  it('gerente inativo não entra (sessão encerrada)', async () => {
    fakeSupabase.setPersistedSession(makeProfile({ id: 'u-maria', role: 'gerente', ativo: false }));
    renderApp('/equipe');
    expect(await screen.findByLabelText('Usuário')).toBeInTheDocument();
  });
});
