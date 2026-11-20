/**
 * Lançar › Despesas (spec 009, T009.3/T009.5): abas na URL, lançar R$ 35,90,
 * validação do valor, editar/excluir, estado vazio, gestor e selo "por <nome>".
 */
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter, useLocation } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ToastProvider } from '@/components/ui';
import { AuthProvider } from '@/features/auth/AuthProvider';
import { createFakeCategoriasTable } from '@/features/categorias/testing/fakeCategoriasTable';
import { createFakeLancamentosTable } from '@/features/lancamentos/testing/fakeLancamentosTable';
import { createQueryClient } from '@/lib/queryClient';
import { AppRoutes } from '@/routes/AppRoutes';
import { fakeSupabase, makeProfile } from '@/test/supabaseMock';
import {
  createFakeCategoriasDespesaTable,
  createFakeDespesasTable,
  makeCategoriaDespesa,
  makeDespesa,
} from './testing/fakeDespesas';

vi.mock('@/lib/supabase', async () => ({
  supabase: (await import('@/test/supabaseMock')).fakeSupabase.client,
}));

const EU = makeProfile({ id: 'user-1', nome: 'João', username: 'joao' });
// Admin: o gerente não vê nem lança despesas de atendentes (spec 011).

const MARIA = makeProfile({ id: 'u-maria', nome: 'Maria', username: 'maria', role: 'admin' });
const ANA = makeProfile({ id: 'u-ana', nome: 'Ana', username: 'ana' });

let logado = EU.id;
const categorias = createFakeCategoriasTable();
const lancamentos = createFakeLancamentosTable(() => categorias.rows);
const catsDespesa = createFakeCategoriasDespesaTable();
const despesas = createFakeDespesasTable(
  () => catsDespesa.rows,
  () => logado,
);

const COMBUSTIVEL = makeCategoriaDespesa({ id: 'cd-c', nome: 'Combustível' });
const MANUTENCAO = makeCategoriaDespesa({ id: 'cd-m', nome: 'Manutenção' });
const ANA_PEDAGIO = makeCategoriaDespesa({ id: 'cd-ap', user_id: 'u-ana', nome: 'Pedágio' });

function LocationProbe() {
  const { pathname, search } = useLocation();
  return <output data-testid="location">{`${pathname}${search}`}</output>;
}
const url = () => screen.getByTestId('location').textContent;

function abrir(path = '/?aba=despesas') {
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
  return { user, queryClient };
}

function entrarComo(profile: typeof EU) {
  logado = profile.id;
  fakeSupabase.setPersistedSession(profile);
}

const adicionar = () => screen.getByRole('button', { name: 'Adicionar despesa' });

describe('Lançar › Despesas', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date(2026, 10, 20, 12, 0, 0));
    fakeSupabase.reset();
    categorias.reset();
    lancamentos.reset();
    catsDespesa.reset();
    despesas.reset();
    fakeSupabase.addProfiles(EU, MARIA, ANA);
    fakeSupabase.setTableHandler('categorias', categorias.handler);
    fakeSupabase.setTableHandler('lancamentos', lancamentos.handler);
    fakeSupabase.setTableHandler('categorias_despesa', catsDespesa.handler);
    fakeSupabase.setTableHandler('despesas', despesas.handler);
    fakeSupabase.setRpcHandler('autores', (args) => {
      const ids = Array.isArray(args.p_ids) ? (args.p_ids as string[]) : [];
      const nomes: Record<string, string> = { 'u-maria': 'Maria' };
      return {
        data: ids.filter((id) => nomes[id]).map((id) => ({ id, nome: nomes[id] })),
        error: null,
      };
    });
    catsDespesa.seed([COMBUSTIVEL, MANUTENCAO, ANA_PEDAGIO]);
    entrarComo(EU);
  });

  afterEach(() => vi.useRealTimers());

  it('abas acessíveis: Entregas é o padrão, Despesas vai para ?aba=despesas e mantém a data', async () => {
    const { user } = abrir('/');
    const abas = await screen.findByRole('tablist', { name: 'Tipo de lançamento' });
    const entregas = within(abas).getByRole('tab', { name: 'Entregas' });
    const despesasTab = within(abas).getByRole('tab', { name: 'Despesas' });
    expect(entregas).toHaveAttribute('aria-selected', 'true');
    expect(entregas).toHaveAttribute('tabindex', '0');
    expect(despesasTab).toHaveAttribute('aria-selected', 'false');
    expect(despesasTab).toHaveAttribute('tabindex', '-1');
    expect(screen.getByRole('tabpanel', { name: 'Entregas' })).toBeInTheDocument();

    // A data escolhida vale para as duas abas.
    await user.click(screen.getByRole('button', { name: 'Dia anterior' }));
    await user.click(despesasTab);
    expect(url()).toBe('/?aba=despesas');
    expect(despesasTab).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByRole('tabpanel', { name: 'Despesas' })).toBeInTheDocument();
    expect(screen.getByTestId('data-rotulo')).toHaveTextContent('Ontem, 19/11/2026');
    expect(await screen.findByRole('heading', { name: 'Despesas de ontem' })).toBeInTheDocument();

    // Teclado: ← volta para Entregas e move o foco.
    await user.keyboard('{ArrowLeft}');
    expect(entregas).toHaveFocus();
    expect(entregas).toHaveAttribute('aria-selected', 'true');
    expect(url()).toBe('/');
  });

  it('?aba=despesas sobrevive ao reload e preserva ?usuario do gestor', async () => {
    entrarComo(MARIA);
    const { user } = abrir('/?usuario=u-ana&aba=despesas');
    const despesasTab = await screen.findByRole('tab', { name: 'Despesas' });
    expect(despesasTab).toHaveAttribute('aria-selected', 'true');
    expect(await screen.findByRole('radio', { name: 'Pedágio' })).toBeInTheDocument();
    await user.click(screen.getByRole('tab', { name: 'Entregas' }));
    expect(url()).toBe('/?usuario=u-ana');
    await user.click(screen.getByRole('tab', { name: 'Despesas' }));
    expect(url()).toBe('/?usuario=u-ana&aba=despesas');
  });

  it('lança Combustível R$ 35,90: payload sem criado_por, lista e total do dia', async () => {
    const { user, queryClient } = abrir();
    const invalidate = vi.spyOn(queryClient, 'invalidateQueries');
    await user.click(await screen.findByRole('radio', { name: 'Combustível' }));
    const valor = screen.getByLabelText('Valor (R$)');
    expect(valor).toHaveAttribute('inputmode', 'decimal');
    await user.type(valor, '35,90');
    await user.type(screen.getByLabelText('Descrição (opcional)'), 'posto da esquina');
    await user.click(adicionar());

    expect(await screen.findByText('Despesa adicionada — R$ 35,90')).toBeInTheDocument();
    expect(despesas.inserts).toEqual([
      {
        user_id: 'user-1',
        data: '2026-11-20',
        categoria_despesa_id: 'cd-c',
        valor: 35.9,
        descricao: 'posto da esquina',
      },
    ]);
    expect(despesas.inserts[0]).not.toHaveProperty('criado_por');
    expect(await screen.findByTestId('total-despesas-dia')).toHaveTextContent('R$ 35,90');
    const lista = screen.getByRole('list', { name: 'Despesas de hoje' });
    expect(within(lista).getByText('posto da esquina')).toBeInTheDocument();
    // Campos limpos; a categoria continua marcada para a próxima.
    expect(screen.getByLabelText('Valor (R$)')).toHaveValue('');
    expect(screen.getByRole('radio', { name: 'Combustível' })).toBeChecked();
    // Toda listagem filtra pelo dono.
    expect(despesas.selects.length).toBeGreaterThan(0);
    despesas.selects.forEach((eqs) => expect(eqs).toMatchObject({ user_id: 'user-1' }));
    catsDespesa.selects.forEach((eqs) => expect(eqs).toMatchObject({ user_id: 'user-1' }));
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ['despesas', 'user-1', '2026-11-20'] });
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ['resumo'] });
  });

  it('bloqueia valor 0, negativo, vazio e categoria não escolhida, sem chamar o servidor', async () => {
    const { user } = abrir();
    await screen.findByRole('radio', { name: 'Combustível' });
    await user.click(adicionar());
    expect(screen.getByText('Escolha a categoria.')).toBeInTheDocument();
    expect(screen.getByText('Informe o valor.')).toBeInTheDocument();

    await user.click(screen.getByRole('radio', { name: 'Combustível' }));
    await user.type(screen.getByLabelText('Valor (R$)'), '0');
    await user.click(adicionar());
    expect(screen.getByText('Informe um valor maior que zero.')).toBeInTheDocument();
    expect(screen.getByLabelText('Valor (R$)')).toHaveAttribute('aria-invalid', 'true');

    await user.clear(screen.getByLabelText('Valor (R$)'));
    await user.type(screen.getByLabelText('Valor (R$)'), '-5');
    await user.click(adicionar());
    expect(screen.getByText('O valor não pode ser negativo.')).toBeInTheDocument();
    expect(despesas.inserts).toHaveLength(0);
  });

  it('data futura recusada pelo banco mostra a mensagem amigável', async () => {
    const { user } = abrir();
    await user.click(await screen.findByRole('radio', { name: 'Combustível' }));
    await user.type(screen.getByLabelText('Valor (R$)'), '10');
    despesas.failNext(
      '23514',
      'new row for relation "despesas" violates check constraint "despesas_data_nao_futura"',
    );
    await user.click(adicionar());
    expect(
      await screen.findByText(
        'Não dá para lançar em data futura. Escolha hoje ou um dia anterior.',
      ),
    ).toBeInTheDocument();
    expect(screen.getByLabelText('Valor (R$)')).toHaveValue('10');
  });

  it('editar valor no BottomSheet e excluir com confirmação', async () => {
    despesas.seed([
      makeDespesa({ id: 'd1', categoria_despesa_id: 'cd-c', valor: 35.9 }),
      makeDespesa({ id: 'd2', categoria_despesa_id: 'cd-m', valor: 10, created_at: '2026-01-02' }),
    ]);
    const { user } = abrir();
    expect(await screen.findByTestId('total-despesas-dia')).toHaveTextContent('R$ 45,90');

    await user.click(screen.getByRole('button', { name: 'Editar despesa Combustível, R$ 35,90' }));
    const sheet = await screen.findByRole('dialog', { name: 'Editar despesa' });
    expect(within(sheet).getByLabelText('Categoria')).toHaveValue('cd-c');
    const valor = within(sheet).getByLabelText('Valor (R$)');
    expect(valor).toHaveValue('35,90');
    await user.clear(valor);
    await user.type(valor, '40');
    await user.click(within(sheet).getByRole('button', { name: 'Salvar' }));
    expect(await screen.findByText('Despesa atualizada.')).toBeInTheDocument();
    await waitFor(() =>
      expect(screen.getByTestId('total-despesas-dia')).toHaveTextContent('R$ 50,00'),
    );
    expect(despesas.updates.at(-1)).toEqual({
      categoria_despesa_id: 'cd-c',
      valor: 40,
      descricao: null,
    });

    await user.click(screen.getByRole('button', { name: /Editar despesa Manutenção/ }));
    const sheet2 = await screen.findByRole('dialog', { name: 'Editar despesa' });
    await user.click(within(sheet2).getByRole('button', { name: 'Excluir' }));
    const confirm = await screen.findByRole('alertdialog', { name: 'Excluir despesa?' });
    await user.click(within(confirm).getByRole('button', { name: 'Excluir' }));
    expect(await screen.findByText('Despesa excluída.')).toBeInTheDocument();
    await waitFor(() =>
      expect(screen.getByTestId('total-despesas-dia')).toHaveTextContent('R$ 40,00'),
    );
    expect(despesas.rows.map((r) => r.id)).toEqual(['d1']);
  });

  it('sem categorias de despesa ativas: estado vazio com link para Categorias › Despesas', async () => {
    catsDespesa.seed([makeCategoriaDespesa({ id: 'x', nome: 'Antiga', ativa: false })]);
    abrir();
    expect(
      await screen.findByRole('heading', { name: 'Cadastre suas categorias de despesa' }),
    ).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Cadastrar categorias de despesa' })).toHaveAttribute(
      'href',
      '/categorias?aba=despesas',
    );
    expect(screen.queryByRole('button', { name: 'Adicionar despesa' })).not.toBeInTheDocument();
    expect(await screen.findByText('Nenhuma despesa neste dia.')).toBeInTheDocument();
  });

  it('gestor lança para outro atendente: user_id do alvo, criado_por pelo banco', async () => {
    entrarComo(MARIA);
    const { user } = abrir('/?usuario=u-ana&aba=despesas');
    await user.click(await screen.findByRole('radio', { name: 'Pedágio' }));
    expect(screen.queryByRole('radio', { name: 'Combustível' })).not.toBeInTheDocument();
    await user.type(screen.getByLabelText('Valor (R$)'), '12.50');
    await user.click(adicionar());
    expect(await screen.findByText('Despesa adicionada — R$ 12,50')).toBeInTheDocument();
    expect(despesas.inserts[0]).toMatchObject({ user_id: 'u-ana', valor: 12.5 });
    expect(despesas.inserts[0]).not.toHaveProperty('criado_por');
    expect(despesas.rows[0]).toMatchObject({ user_id: 'u-ana', criado_por: 'u-maria' });
    despesas.selects.forEach((eqs) => expect(eqs).toMatchObject({ user_id: 'u-ana' }));
    // O gestor também vê o selo "por Maria" na lista de outra pessoa.
    expect(await screen.findByTestId('selo-autor')).toHaveTextContent('por Maria');
  });

  it('o dono vê a despesa lançada pelo gestor com o selo "por <nome>"', async () => {
    despesas.seed([
      makeDespesa({ id: 'd1', categoria_despesa_id: 'cd-c', valor: 35.9, criado_por: 'u-maria' }),
      makeDespesa({ id: 'd2', categoria_despesa_id: 'cd-m', valor: 5, created_at: '2026-01-02' }),
    ]);
    abrir();
    const selo = await screen.findByTestId('selo-autor');
    expect(selo).toHaveTextContent('por Maria');
    expect(
      screen.getByRole('button', {
        name: 'Editar despesa Combustível, R$ 35,90, lançada por Maria',
      }),
    ).toBeInTheDocument();
    expect(screen.getAllByTestId('selo-autor')).toHaveLength(1);
    expect(fakeSupabase.rpc).toHaveBeenCalledWith('autores', { p_ids: ['u-maria'] });
  });
});
