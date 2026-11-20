import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter, useLocation } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ToastProvider } from '@/components/ui';
import { AuthProvider } from '@/features/auth/AuthProvider';
import {
  createFakeCategoriasTable,
  makeCategoria,
} from '@/features/categorias/testing/fakeCategoriasTable';
import { RELATORIO_ERROR_MESSAGES } from '@/features/relatorio/errors';
import { createFakeResumo } from '@/features/relatorio/testing/fakeResumo';
import { createQueryClient } from '@/lib/queryClient';
import { AppRoutes } from '@/routes/AppRoutes';
import { fakeSupabase, makeProfile } from '@/test/supabaseMock';
import type { Perfil } from './api';
import { createFakeEquipe } from './testing/fakeEquipe';

vi.mock('@/lib/supabase', async () => ({
  supabase: (await import('@/test/supabaseMock')).fakeSupabase.client,
}));

const equipe = createFakeEquipe();
const categorias = createFakeCategoriasTable();
const resumo = createFakeResumo();

const MARIA = makeProfile({ id: 'u-maria', nome: 'Maria', username: 'maria', role: 'gerente' });
const perfil = (p: Omit<Perfil, 'gerente_id'> & { gerente_id?: string | null }): Perfil => ({
  gerente_id: null,
  ...p,
});
const PERFIS: Perfil[] = [
  perfil({ id: 'u-maria', nome: 'Maria', username: 'maria', role: 'gerente', ativo: true }),
  perfil({ id: 'u-joao', nome: 'João', username: 'joao', role: 'user', ativo: true }),
  perfil({ id: 'u-ana', nome: 'Ana', username: 'ana', role: 'user', ativo: true }),
  perfil({ id: 'u-ze', nome: 'Zé', username: 'ze', role: 'user', ativo: false }),
];

function LocationProbe() {
  const { pathname, search } = useLocation();
  return <output data-testid="location">{`${pathname}${search}`}</output>;
}
const url = () => screen.getByTestId('location').textContent;

function abrir(path = '/equipe') {
  const queryClient = createQueryClient();
  queryClient.setDefaultOptions({ queries: { retry: false }, mutations: { retry: false } });
  const user = userEvent.setup();
  render(
    <QueryClientProvider client={queryClient}>
      <ToastProvider>
        <AuthProvider>
          <MemoryRouter initialEntries={[path]}>
            <AppRoutes />
            <LocationProbe />
          </MemoryRouter>
        </AuthProvider>
      </ToastProvider>
    </QueryClientProvider>,
  );
  return { user };
}

async function itens() {
  const lista = await screen.findByRole('list', { name: 'Por atendente' });
  return within(lista).getAllByTestId('equipe-item');
}

const totalCard = () => screen.getByRole('region', { name: 'Total a pagar (todos)' });

describe('EquipePage', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date(2026, 10, 20, 12, 0, 0));
    fakeSupabase.reset();
    equipe.reset();
    categorias.reset();
    resumo.reset();
    fakeSupabase.setPersistedSession(MARIA);
    fakeSupabase.setTableHandler('categorias', categorias.handler);
    equipe.register(fakeSupabase);
    resumo.register(fakeSupabase);
    resumo.setAuth('u-maria', true);
    // Mesmo nome com grafias diferentes entre usuários: vira uma opção só.
    categorias.seed([
      makeCategoria({ id: 'j-s', user_id: 'u-joao', nome: 'Sanduíche' }),
      makeCategoria({ id: 'j-p', user_id: 'u-joao', nome: 'Pizza' }),
      makeCategoria({ id: 'a-a', user_id: 'u-ana', nome: 'Água' }),
      makeCategoria({ id: 'a-p', user_id: 'u-ana', nome: 'pizza ' }),
      makeCategoria({ id: 'm-p', user_id: 'u-maria', nome: 'Pizza' }),
    ]);
    equipe.seed({
      perfis: PERFIS,
      lancamentos: [
        // João: 50 × 2,50 + 20 × 5,00 = 225,00
        {
          user_id: 'u-joao',
          data: '2026-11-20',
          categoria: 'Sanduíche',
          quantidade: 50,
          valor_unitario_centavos: 250,
        },
        {
          user_id: 'u-joao',
          data: '2026-11-19',
          categoria: 'Pizza',
          quantidade: 20,
          valor_unitario_centavos: 500,
        },
        // Ana: 10 × 3,00 = 30,00
        {
          user_id: 'u-ana',
          data: '2026-11-18',
          categoria: 'Água',
          quantidade: 10,
          valor_unitario_centavos: 300,
        },
      ],
    });
  });

  afterEach(() => vi.useRealTimers());

  it('João R$ 225,00 + Ana R$ 30,00 = R$ 255,00; quem tem 0 no fim, esmaecido, com selos', async () => {
    abrir();
    const linhas = await itens();
    expect(totalCard()).toHaveTextContent('R$ 255,00');
    expect(totalCard()).toHaveTextContent('80 entregas');
    expect(linhas.map((li) => within(li).getByTestId('equipe-valor').textContent)).toEqual([
      'R$ 225,00',
      'R$ 30,00',
      'R$ 0,00',
      'R$ 0,00',
    ]);
    expect(linhas[0]).toHaveTextContent('João');
    expect(linhas[0]).toHaveTextContent('@joao');
    expect(linhas[0]).toHaveTextContent('70 entregas');
    expect(linhas[1]).toHaveTextContent('Ana');
    expect(linhas[2]).toHaveTextContent('Maria');
    expect(linhas[2]).toHaveTextContent('Gerente');
    expect(linhas[3]).toHaveTextContent('Zé');
    expect(linhas[3]).toHaveTextContent('Inativo');
    expect(linhas[0]).not.toHaveClass('opacity-60');
    expect(linhas[2]).toHaveClass('opacity-60');
    expect(linhas[3]).toHaveClass('opacity-60');
    expect(equipe.calls.at(-1)).toEqual({
      fn: 'resumo_por_usuario',
      de: '2026-11-01',
      ate: '2026-11-30',
    });
  });

  it('filtro "Pizza" (por nome, sem diferenciar maiúsculas): João R$ 100,00, Ana R$ 0,00, total R$ 100,00', async () => {
    const { user } = abrir();
    await itens();
    await user.click(screen.getByRole('button', { name: 'Categorias: Todas' }));
    const sheet = screen.getByRole('dialog', { name: 'Filtrar categorias' });
    const opcoes = within(sheet).getAllByRole('checkbox');
    expect(opcoes.map((c) => c.closest('label')?.textContent)).toEqual([
      'Água',
      'Pizza',
      'Sanduíche',
    ]);
    await user.click(within(sheet).getByRole('button', { name: 'Limpar' }));
    await user.click(within(sheet).getByRole('checkbox', { name: 'Pizza' }));
    await user.click(within(sheet).getByRole('button', { name: 'Aplicar' }));

    expect(url()).toBe('/equipe?nomes=pizza');
    await waitFor(() => expect(totalCard()).toHaveTextContent('R$ 100,00'));
    const linhas = await itens();
    expect(linhas[0]).toHaveTextContent('João');
    expect(within(linhas[0]).getByTestId('equipe-valor')).toHaveTextContent('R$ 100,00');
    const ana = linhas.find((li) => within(li).queryByText('Ana'));
    expect(ana && within(ana).getByTestId('equipe-valor')).toHaveTextContent('R$ 0,00');
    expect(screen.getByRole('button', { name: 'Categorias: Pizza' })).toBeInTheDocument();
    expect(equipe.calls.at(-1)).toEqual({
      fn: 'resumo_por_usuario_nomes',
      de: '2026-11-01',
      ate: '2026-11-30',
      nomes: ['pizza'],
    });

    // Trocar o período preserva o filtro.
    await user.click(screen.getByRole('button', { name: 'Semana' }));
    expect(url()).toBe('/equipe?periodo=semana&nomes=pizza');
  });

  it('tocar num atendente abre o relatório dele com o mesmo período', async () => {
    fakeSupabase.addProfiles(makeProfile({ id: 'u-joao', nome: 'João', username: 'joao' }));
    const { user } = abrir('/equipe?periodo=semana');
    await itens();
    await user.click(screen.getByRole('link', { name: /^João:/ }));
    expect(url()).toBe('/relatorio?periodo=semana&usuario=u-joao');
    expect(await screen.findByRole('button', { name: 'Relatório de: João' })).toBeInTheDocument();
  });

  it('erro de permissão (42501) mostra a mensagem e o botão de tentar de novo', async () => {
    equipe.setGestor(false);
    abrir();
    expect(await screen.findByText(RELATORIO_ERROR_MESSAGES.acessoNegado)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Tentar de novo' })).toBeInTheDocument();
  });

  it('período sem lançamentos: aviso e lista com todos esmaecidos', async () => {
    abrir('/equipe?de=2026-10-01&ate=2026-10-31');
    const linhas = await itens();
    expect(totalCard()).toHaveTextContent('R$ 0,00');
    expect(screen.getByText('Ninguém lançou entregas neste período.')).toBeInTheDocument();
    linhas.forEach((li) => expect(li).toHaveClass('opacity-60'));
  });
});
