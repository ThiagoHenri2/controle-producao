/**
 * Relatório com tipo Receitas | Despesas | Ambos (spec 009, T009.6): totais,
 * saldo, "Por dia" combinado e filtro `dcats`.
 */
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
import {
  createFakeCategoriasDespesaTable,
  createFakeDespesasTable,
  createFakeResumoDespesas,
  makeCategoriaDespesa,
  makeDespesa,
} from '@/features/despesas/testing/fakeDespesas';
import { createQueryClient } from '@/lib/queryClient';
import { AppRoutes } from '@/routes/AppRoutes';
import { fakeSupabase, makeProfile } from '@/test/supabaseMock';
import { createFakeResumo, type FakeLancamento } from './testing/fakeResumo';

vi.mock('@/lib/supabase', async () => ({
  supabase: (await import('@/test/supabaseMock')).fakeSupabase.client,
}));

const resumo = createFakeResumo();
const categorias = createFakeCategoriasTable();
const catsDespesa = createFakeCategoriasDespesaTable();
const despesas = createFakeDespesasTable(() => catsDespesa.rows);
const resumoDespesas = createFakeResumoDespesas(
  () => despesas.rows,
  () => catsDespesa.rows,
);

function LocationProbe() {
  const { pathname, search } = useLocation();
  return <output data-testid="location">{`${pathname}${search}`}</output>;
}
const url = () => screen.getByTestId('location').textContent;

async function abrir(path: string) {
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
  await screen.findByRole('group', { name: 'Período' });
  return { user };
}

/** Receitas: 50 Sanduíche × 2,50 ontem + 20 Pizza × 5,00 hoje = R$ 225,00. */
const RECEITAS: FakeLancamento[] = [
  {
    categoria_id: 'cat-s',
    nome: 'Sanduíche',
    valor_unitario_centavos: 250,
    data: '2026-11-19',
    quantidade: 50,
  },
  {
    categoria_id: 'cat-p',
    nome: 'Pizza',
    valor_unitario_centavos: 500,
    data: '2026-11-20',
    quantidade: 20,
  },
];
const COMBUSTIVEL = makeCategoriaDespesa({ id: 'cd-c', nome: 'Combustível' });

const tipo = () => screen.getByRole('group', { name: 'Tipo' });
const saldoCard = () => screen.findByRole('region', { name: 'Saldo no período' });

describe('Relatório: Receitas | Despesas | Ambos', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date(2026, 10, 20, 10, 0));
    fakeSupabase.reset();
    resumo.reset();
    categorias.reset();
    catsDespesa.reset();
    despesas.reset();
    resumoDespesas.reset();
    fakeSupabase.setPersistedSession(makeProfile());
    resumo.register(fakeSupabase);
    resumoDespesas.register(fakeSupabase);
    fakeSupabase.setTableHandler('categorias', categorias.handler);
    fakeSupabase.setTableHandler('categorias_despesa', catsDespesa.handler);
    categorias.seed([
      makeCategoria({ id: 'cat-s', nome: 'Sanduíche', valor_unitario: 2.5 }),
      makeCategoria({ id: 'cat-p', nome: 'Pizza', valor_unitario: 5 }),
    ]);
    catsDespesa.seed([COMBUSTIVEL]);
    resumo.seed(RECEITAS);
    despesas.seed([
      makeDespesa({ id: 'd1', categoria_despesa_id: 'cd-c', valor: 35.9, data: '2026-11-20' }),
    ]);
  });

  afterEach(() => vi.useRealTimers());

  it('padrão Receitas: R$ 225,00 e não consulta despesas', async () => {
    await abrir('/relatorio');
    expect(within(tipo()).getByRole('button', { name: 'Receitas' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    const total = await screen.findByRole('region', { name: 'Total no período' });
    expect(within(total).getByText('R$ 225,00')).toBeInTheDocument();
    expect(resumoDespesas.calls).toHaveLength(0);
    expect(screen.getByRole('button', { name: 'Categorias: Todas' })).toBeInTheDocument();
  });

  it('Despesas: card "Total de despesas" R$ 35,90 com 1 lançamento, por categoria e por dia', async () => {
    const { user } = await abrir('/relatorio');
    await screen.findByRole('region', { name: 'Total no período' });
    await user.click(within(tipo()).getByRole('button', { name: 'Despesas' }));
    expect(url()).toBe('/relatorio?tipo=despesas');

    const total = await screen.findByRole('region', { name: 'Total de despesas' });
    expect(within(total).getByText('R$ 35,90')).toBeInTheDocument();
    expect(within(total).getByText('1 lançamento')).toBeInTheDocument();
    const cats = screen.getByRole('list', { name: 'Por categoria' });
    expect(within(cats).getByText('Combustível')).toBeInTheDocument();
    expect(within(cats).getByText('1 lançamento')).toBeInTheDocument();
    const dias = screen.getByRole('list', { name: 'Por dia' });
    expect(within(dias).getByText('Hoje')).toBeInTheDocument();
    expect(within(dias).getByText('R$ 35,90')).toBeInTheDocument();
    expect(resumoDespesas.calls).toEqual(
      expect.arrayContaining([
        { fn: 'resumo_despesas_por_categoria', de: '2026-11-01', ate: '2026-11-30' },
        { fn: 'resumo_despesas_por_dia', de: '2026-11-01', ate: '2026-11-30' },
      ]),
    );
  });

  it('Ambos: Receitas R$ 225,00, Despesas R$ 35,90, Saldo R$ 189,10 e seções Entregas/Despesas', async () => {
    await abrir('/relatorio?tipo=ambos');
    const card = await saldoCard();
    expect(within(card).getByTestId('saldo-receitas')).toHaveTextContent('R$ 225,00');
    expect(within(card).getByTestId('saldo-despesas')).toHaveTextContent('R$ 35,90');
    const saldo = within(card).getByTestId('saldo-valor');
    expect(saldo).toHaveTextContent('R$ 189,10');
    expect(saldo).not.toHaveClass('text-red-700');

    const entregas = screen.getByRole('list', { name: 'Entregas' });
    expect(within(entregas).getByText('Sanduíche')).toBeInTheDocument();
    expect(within(entregas).getByText('Pizza')).toBeInTheDocument();
    const desp = screen.getByRole('list', { name: 'Despesas' });
    expect(within(desp).getByText('Combustível')).toBeInTheDocument();
  });

  it('Ambos: "Por dia" combina receitas, despesas e saldo de cada data (em centavos)', async () => {
    await abrir('/relatorio?tipo=ambos');
    await saldoCard();
    const itens = within(screen.getByRole('list', { name: 'Por dia' })).getAllByRole('listitem');
    expect(itens).toHaveLength(2);
    // Hoje: +100,00 − 35,90 = 64,10
    expect(within(itens[0]).getByText('Hoje')).toBeInTheDocument();
    expect(within(itens[0]).getByTestId('dia-receitas')).toHaveTextContent('R$ 100,00');
    expect(within(itens[0]).getByTestId('dia-despesas')).toHaveTextContent('R$ 35,90');
    expect(within(itens[0]).getByTestId('dia-saldo')).toHaveTextContent('R$ 64,10');
    // Ontem: só receitas.
    expect(within(itens[1]).getByText('Ontem')).toBeInTheDocument();
    expect(within(itens[1]).getByTestId('dia-despesas')).toHaveTextContent('R$ 0,00');
    expect(within(itens[1]).getByTestId('dia-saldo')).toHaveTextContent('R$ 125,00');
  });

  it('saldo negativo fica em vermelho', async () => {
    despesas.seed([
      makeDespesa({ id: 'd1', categoria_despesa_id: 'cd-c', valor: 300, data: '2026-11-20' }),
    ]);
    await abrir('/relatorio?tipo=ambos');
    const saldo = within(await saldoCard()).getByTestId('saldo-valor');
    expect(saldo).toHaveTextContent('-R$ 75,00');
    expect(saldo).toHaveClass('text-red-700');
  });

  it('filtro dcats: desmarcar Combustível zera as despesas e o saldo volta a R$ 225,00', async () => {
    const { user } = await abrir('/relatorio?tipo=ambos');
    await saldoCard();
    await user.click(screen.getByRole('button', { name: 'Categorias: Todas' }));
    const sheet = await screen.findByRole('dialog', { name: 'Filtrar categorias' });
    expect(within(sheet).getByRole('heading', { name: /Entregas/ })).toBeInTheDocument();
    expect(within(sheet).getByRole('heading', { name: /Despesas/ })).toBeInTheDocument();
    await user.click(within(sheet).getByRole('checkbox', { name: 'Combustível' }));
    await user.click(within(sheet).getByRole('button', { name: 'Aplicar' }));

    expect(url()).toBe('/relatorio?tipo=ambos&dcats=nenhuma');
    await waitFor(async () =>
      expect(within(await saldoCard()).getByTestId('saldo-valor')).toHaveTextContent('R$ 225,00'),
    );
    expect(within(await saldoCard()).getByTestId('saldo-despesas')).toHaveTextContent('R$ 0,00');
    expect(
      screen.getByRole('button', { name: 'Entregas: Todas · Despesas: Nenhuma' }),
    ).toBeInTheDocument();
    expect(resumoDespesas.calls.at(-1)).toMatchObject({ categorias: [] });
    expect(within(await saldoCard()).getByText('Filtrando 2 de 3 categorias')).toBeInTheDocument();

    // Limpar filtro remove os dois parâmetros.
    await user.click(within(await saldoCard()).getByRole('button', { name: 'Limpar filtro' }));
    expect(url()).toBe('/relatorio?tipo=ambos');
  });

  it('filtro dcats com outra categoria grava os IDs; em Despesas a checklist só tem a seção Despesas', async () => {
    catsDespesa.seed([COMBUSTIVEL, makeCategoriaDespesa({ id: 'cd-m', nome: 'Manutenção' })]);
    const { user } = await abrir('/relatorio?tipo=despesas');
    await screen.findByRole('region', { name: 'Total de despesas' });
    await user.click(screen.getByRole('button', { name: 'Categorias: Todas' }));
    const sheet = await screen.findByRole('dialog', { name: 'Filtrar categorias' });
    expect(within(sheet).queryByRole('checkbox', { name: 'Pizza' })).not.toBeInTheDocument();
    await user.click(within(sheet).getByRole('checkbox', { name: 'Combustível' }));
    await user.click(within(sheet).getByRole('button', { name: 'Aplicar' }));
    expect(url()).toBe('/relatorio?tipo=despesas&dcats=cd-m');
    expect(
      await screen.findByRole('heading', {
        name: 'Nenhuma despesa destas categorias neste período',
      }),
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Categorias: Manutenção' })).toBeInTheDocument();
  });

  it('tipo e filtros sobrevivem ao reload; cats só afeta receitas', async () => {
    await abrir('/relatorio?tipo=ambos&cats=cat-p');
    const card = await saldoCard();
    await waitFor(() =>
      expect(within(card).getByTestId('saldo-receitas')).toHaveTextContent('R$ 100,00'),
    );
    expect(within(card).getByTestId('saldo-valor')).toHaveTextContent('R$ 64,10');
    expect(within(tipo()).getByRole('button', { name: 'Ambos' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    expect(
      screen.getByRole('button', { name: 'Entregas: Pizza · Despesas: Todas' }),
    ).toBeInTheDocument();
  });
});
