/** Categorias › Despesas (spec 009, T009.4): CRUD sem valor, duplicado e "em uso" → Desativar. */
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter, useLocation } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ToastProvider } from '@/components/ui';
import { AuthProvider } from '@/features/auth/AuthProvider';
import {
  createFakeCategoriasTable,
  makeCategoria,
} from '@/features/categorias/testing/fakeCategoriasTable';
import { createQueryClient } from '@/lib/queryClient';
import { AppRoutes } from '@/routes/AppRoutes';
import { fakeSupabase, makeProfile } from '@/test/supabaseMock';
import { createFakeCategoriasDespesaTable, makeCategoriaDespesa } from './testing/fakeDespesas';

vi.mock('@/lib/supabase', async () => ({
  supabase: (await import('@/test/supabaseMock')).fakeSupabase.client,
}));

const categorias = createFakeCategoriasTable();
const table = createFakeCategoriasDespesaTable();

function LocationProbe() {
  const { pathname, search } = useLocation();
  return <output data-testid="location">{`${pathname}${search}`}</output>;
}
const url = () => screen.getByTestId('location').textContent;

function abrir(path = '/categorias?aba=despesas') {
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
  return user;
}

async function excluir(user: ReturnType<typeof userEvent.setup>, nome: RegExp) {
  await user.click(await screen.findByRole('button', { name: nome }));
  await user.click(
    within(await screen.findByRole('dialog')).getByRole('button', { name: 'Excluir' }),
  );
  await user.click(
    within(screen.getByRole('alertdialog', { name: 'Excluir categoria?' })).getByRole('button', {
      name: 'Excluir',
    }),
  );
}

describe('Categorias › Despesas', () => {
  beforeEach(() => {
    fakeSupabase.reset();
    categorias.reset();
    table.reset();
    fakeSupabase.setPersistedSession(makeProfile());
    fakeSupabase.setTableHandler('categorias', categorias.handler);
    fakeSupabase.setTableHandler('categorias_despesa', table.handler);
    categorias.seed([makeCategoria({ id: 's', nome: 'Sanduíche', valor_unitario: 2.5 })]);
  });

  it('abas: Entregas mostra as de entrega; Despesas vai para ?aba=despesas', async () => {
    const user = abrir('/categorias');
    expect(
      await screen.findByRole('button', { name: 'Editar Sanduíche, R$ 2,50' }),
    ).toBeInTheDocument();
    await user.click(screen.getByRole('tab', { name: 'Despesas' }));
    expect(url()).toBe('/categorias?aba=despesas');
    expect(
      await screen.findByRole('heading', { name: 'Cadastre sua primeira categoria de despesa' }),
    ).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Sanduíche/ })).not.toBeInTheDocument();
  });

  it('cria "Combustível" sem campo de valor e lista sem R$', async () => {
    const user = abrir();
    await user.click(await screen.findByRole('button', { name: 'Nova categoria' }));
    const sheet = await screen.findByRole('dialog', { name: 'Nova categoria' });
    expect(within(sheet).queryByLabelText(/Valor/)).not.toBeInTheDocument();
    await user.type(within(sheet).getByLabelText('Nome'), 'Combustível');
    await user.click(within(sheet).getByRole('button', { name: 'Salvar' }));

    expect(await screen.findByText('Categoria criada.')).toBeInTheDocument();
    const lista = await screen.findByRole('list', { name: 'Categorias de despesa ativas' });
    expect(within(lista).getByRole('button', { name: 'Editar Combustível' })).toBeInTheDocument();
    expect(within(lista).queryByText(/R\$/)).not.toBeInTheDocument();
    expect(table.inserts).toEqual([{ user_id: 'user-1', nome: 'Combustível', ativa: true }]);
    expect(table.inserts[0]).not.toHaveProperty('valor_unitario');
    table.selects.forEach((eqs) => expect(eqs).toMatchObject({ user_id: 'user-1' }));
  });

  it('nome duplicado (sem diferenciar maiúsculas) e 23505 do banco mostram a mensagem abaixo do nome', async () => {
    table.seed([makeCategoriaDespesa({ id: 'c', nome: 'Combustível' })]);
    const user = abrir();
    await user.click(await screen.findByRole('button', { name: 'Nova categoria' }));
    const sheet = await screen.findByRole('dialog');
    await user.type(within(sheet).getByLabelText('Nome'), ' COMBUSTÍVEL ');
    await user.click(within(sheet).getByRole('button', { name: 'Salvar' }));
    expect(within(sheet).getByText('Já existe uma categoria com esse nome.')).toBeInTheDocument();
    expect(table.inserts).toHaveLength(0);

    await user.clear(within(sheet).getByLabelText('Nome'));
    await user.type(within(sheet).getByLabelText('Nome'), 'Pedágio');
    table.failNext('23505', 'duplicate key value violates unique constraint');
    await user.click(within(sheet).getByRole('button', { name: 'Salvar' }));
    expect(
      await within(sheet).findByText('Já existe uma categoria com esse nome.'),
    ).toBeInTheDocument();
    expect(screen.queryByText(/duplicate key/)).not.toBeInTheDocument();
  });

  it('renomeia e desativa (vai para "Inativas")', async () => {
    table.seed([makeCategoriaDespesa({ id: 'c', nome: 'Combustivel' })]);
    const user = abrir();
    await user.click(await screen.findByRole('button', { name: 'Editar Combustivel' }));
    const sheet = await screen.findByRole('dialog', { name: 'Editar categoria' });
    const nome = within(sheet).getByLabelText('Nome');
    await user.clear(nome);
    await user.type(nome, 'Combustível');
    await user.click(within(sheet).getByRole('switch', { name: 'Ativa' }));
    await user.click(within(sheet).getByRole('button', { name: 'Salvar' }));
    expect(await screen.findByText('Categoria salva.')).toBeInTheDocument();
    expect(table.updates.at(-1)).toEqual({ nome: 'Combustível', ativa: false });
    expect(await screen.findByRole('button', { name: /Inativas \(1\)/ })).toBeInTheDocument();
  });

  it('excluir sem despesas remove', async () => {
    table.seed([
      makeCategoriaDespesa({ id: 'c', nome: 'Combustível' }),
      makeCategoriaDespesa({ id: 'm', nome: 'Manutenção' }),
    ]);
    const user = abrir();
    await excluir(user, /Editar Manutenção/);
    expect(await screen.findByText('Categoria excluída.')).toBeInTheDocument();
    expect(table.rows.map((r) => r.id)).toEqual(['c']);
  });

  it.each(['23503', '23001'])(
    'excluir categoria com despesas (%s) oferece "Desativar"',
    async (code) => {
      table.seed([makeCategoriaDespesa({ id: 'c', nome: 'Combustível' })]);
      table.marcarEmUso('c', code);
      const user = abrir();
      await excluir(user, /Editar Combustível/);
      const emUso = await screen.findByRole('alertdialog', { name: 'Não dá para excluir' });
      await user.click(within(emUso).getByRole('button', { name: 'Desativar' }));
      expect(await screen.findByText('Categoria desativada.')).toBeInTheDocument();
      await waitFor(() =>
        expect(table.rows).toEqual([expect.objectContaining({ id: 'c', ativa: false })]),
      );
    },
  );
});
