/** Equipe com tipo Receitas | Despesas | Ambos (spec 009, T009.7). */
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
import { createFakeResumo } from '@/features/relatorio/testing/fakeResumo';
import { createQueryClient } from '@/lib/queryClient';
import { AppRoutes } from '@/routes/AppRoutes';
import { fakeSupabase, makeProfile } from '@/test/supabaseMock';
import type { Perfil } from './api';
import { createFakeEquipe } from './testing/fakeEquipe';

vi.mock('@/lib/supabase', async () => ({
  supabase: (await import('@/test/supabaseMock')).fakeSupabase.client,
}));

const MARIA = makeProfile({ id: 'u-maria', nome: 'Maria', username: 'maria', role: 'gerente' });
const PERFIS: Perfil[] = [
  { id: 'u-maria', nome: 'Maria', username: 'maria', role: 'gerente', ativo: true },
  { id: 'u-joao', nome: 'João', username: 'joao', role: 'user', ativo: true },
  { id: 'u-ana', nome: 'Ana', username: 'ana', role: 'user', ativo: true },
].map((p) => ({ ...p, created_at: '2026-01-01T00:00:00Z' }) as Perfil);

const equipe = createFakeEquipe();
const resumo = createFakeResumo();
const categorias = createFakeCategoriasTable();
const catsDespesa = createFakeCategoriasDespesaTable();
const despesas = createFakeDespesasTable(() => catsDespesa.rows);
const resumoDespesas = createFakeResumoDespesas(
  () => despesas.rows,
  () => catsDespesa.rows,
  () => PERFIS,
);

function LocationProbe() {
  const { pathname, search } = useLocation();
  return <output data-testid="location">{`${pathname}${search}`}</output>;
}
const url = () => screen.getByTestId('location').textContent;

function abrir(path: string) {
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
  const lista = await screen.findByRole('list', { name: 'Por entregador' });
  return within(lista).getAllByTestId('equipe-item');
}
const valores = (linhas: HTMLElement[]) =>
  linhas.map((li) => within(li).getByTestId('equipe-valor').textContent);

describe('Equipe: Receitas | Despesas | Ambos', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date(2026, 10, 20, 12, 0, 0));
    fakeSupabase.reset();
    equipe.reset();
    resumo.reset();
    categorias.reset();
    catsDespesa.reset();
    despesas.reset();
    resumoDespesas.reset();
    fakeSupabase.setPersistedSession(MARIA);
    fakeSupabase.setTableHandler('categorias', categorias.handler);
    fakeSupabase.setTableHandler('categorias_despesa', catsDespesa.handler);
    equipe.register(fakeSupabase);
    resumo.register(fakeSupabase);
    resumo.setAuth('u-maria', true);
    resumoDespesas.register(fakeSupabase);
    resumoDespesas.setAuth('u-maria', true);
    categorias.seed([makeCategoria({ id: 'j-s', user_id: 'u-joao', nome: 'Sanduíche' })]);
    catsDespesa.seed([
      makeCategoriaDespesa({ id: 'j-c', user_id: 'u-joao', nome: 'Combustível' }),
      makeCategoriaDespesa({ id: 'a-c', user_id: 'u-ana', nome: 'combustível ' }),
      makeCategoriaDespesa({ id: 'a-p', user_id: 'u-ana', nome: 'Pedágio' }),
    ]);
    equipe.seed({
      perfis: PERFIS,
      lancamentos: [
        // João: 50 × 2,50 + 20 × 5,00 = 225,00; Ana: 10 × 3,00 = 30,00
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
        {
          user_id: 'u-ana',
          data: '2026-11-18',
          categoria: 'Água',
          quantidade: 10,
          valor_unitario_centavos: 300,
        },
      ],
    });
    // João: Combustível 35,90; Ana: Pedágio 50,00 (saldo negativo).
    despesas.seed([
      makeDespesa({ id: 'd1', user_id: 'u-joao', categoria_despesa_id: 'j-c', valor: 35.9 }),
      makeDespesa({ id: 'd2', user_id: 'u-ana', categoria_despesa_id: 'a-p', valor: 50 }),
    ]);
  });

  afterEach(() => vi.useRealTimers());

  it('Despesas: valores por pessoa e total, via resumo_despesas_por_usuario_nomes', async () => {
    abrir('/equipe?tipo=despesas');
    const linhas = await itens();
    const total = screen.getByRole('region', { name: 'Total de despesas (todos)' });
    expect(total).toHaveTextContent('R$ 85,90');
    expect(total).toHaveTextContent('2 lançamentos');
    expect(valores(linhas)).toEqual(['R$ 50,00', 'R$ 35,90', 'R$ 0,00']);
    expect(linhas[1]).toHaveTextContent('João');
    expect(linhas[1]).toHaveTextContent('1 lançamento');
    expect(resumoDespesas.calls.at(-1)).toEqual({
      fn: 'resumo_despesas_por_usuario_nomes',
      de: '2026-11-01',
      ate: '2026-11-30',
    });
    expect(equipe.calls).toHaveLength(0);
  });

  it('Ambos: João receitas R$ 225,00, despesas R$ 35,90, saldo R$ 189,10; total coerente', async () => {
    abrir('/equipe?tipo=ambos');
    const linhas = await itens();
    const card = screen.getByRole('region', { name: 'Saldo (todos)' });
    expect(within(card).getByTestId('saldo-receitas')).toHaveTextContent('R$ 255,00');
    expect(within(card).getByTestId('saldo-despesas')).toHaveTextContent('R$ 85,90');
    expect(within(card).getByTestId('saldo-valor')).toHaveTextContent('R$ 169,10');

    // Ordem pelo saldo; quem não tem nada vai para o fim.
    expect(valores(linhas)).toEqual(['R$ 189,10', '-R$ 20,00', 'R$ 0,00']);
    const joao = linhas[0];
    expect(joao).toHaveTextContent('João');
    expect(within(joao).getByTestId('equipe-detalhe')).toHaveTextContent('+R$ 225,00 · −R$ 35,90');
    expect(within(linhas[1]).getByTestId('equipe-valor')).toHaveClass('text-red-700');
    expect(linhas[2]).toHaveTextContent('Maria');
    expect(linhas[2]).toHaveClass('opacity-60');
    expect(
      screen.getByRole('link', {
        name: 'João: receitas R$ 225,00, despesas R$ 35,90, saldo R$ 189,10. Ver relatório',
      }),
    ).toBeInTheDocument();
  });

  it('Ambos: filtro "Despesas" por nome (dnomes) — desmarcar Combustível deixa João com saldo R$ 225,00', async () => {
    const { user } = abrir('/equipe?tipo=ambos');
    await itens();
    await user.click(screen.getByRole('button', { name: 'Categorias: Todas' }));
    const sheet = await screen.findByRole('dialog', { name: 'Filtrar categorias' });
    // Mesmo nome com grafias diferentes vira uma opção só.
    expect(within(sheet).getAllByRole('checkbox', { name: /^combustível$/i })).toHaveLength(1);
    await user.click(within(sheet).getByRole('checkbox', { name: /^combustível$/i }));
    await user.click(within(sheet).getByRole('button', { name: 'Aplicar' }));

    expect(url()).toBe('/equipe?tipo=ambos&dnomes=ped%C3%A1gio');
    await waitFor(async () => expect(valores(await itens())[0]).toBe('R$ 225,00'));
    expect(resumoDespesas.calls.at(-1)).toMatchObject({ nomes: ['pedágio'] });
    expect(
      screen.getByRole('button', { name: 'Entregas: Todas · Despesas: Pedágio' }),
    ).toBeInTheDocument();
  });

  it('tocar num entregador abre o relatório dele com o mesmo tipo e período', async () => {
    fakeSupabase.addProfiles(makeProfile({ id: 'u-joao', nome: 'João', username: 'joao' }));
    const { user } = abrir('/equipe?periodo=semana&tipo=ambos');
    await itens();
    await user.click(screen.getByRole('link', { name: /^João:/ }));
    expect(url()).toBe('/relatorio?periodo=semana&usuario=u-joao&tipo=ambos');
    expect(await screen.findByRole('button', { name: 'Relatório de: João' })).toBeInTheDocument();
    expect(
      within(screen.getByRole('group', { name: 'Tipo' })).getByRole('button', { name: 'Ambos' }),
    ).toHaveAttribute('aria-pressed', 'true');
  });
});
