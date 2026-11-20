/**
 * Fluxos do gestor (spec 008) nas telas Lançar, Categorias e Relatório, e o
 * selo "por <nome>" para todos os papéis. App inteiro com o Supabase falso.
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
  createFakeLancamentosTable,
  makeLancamento,
} from '@/features/lancamentos/testing/fakeLancamentosTable';
import { createFakeResumo } from '@/features/relatorio/testing/fakeResumo';
import { createQueryClient } from '@/lib/queryClient';
import { AppRoutes } from '@/routes/AppRoutes';
import { fakeSupabase, makeProfile } from '@/test/supabaseMock';

vi.mock('@/lib/supabase', async () => ({
  supabase: (await import('@/test/supabaseMock')).fakeSupabase.client,
}));

const MARIA = makeProfile({ id: 'u-maria', nome: 'Maria', username: 'maria', role: 'gerente' });
const JOAO = makeProfile({ id: 'u-joao', nome: 'João', username: 'joao' });
const ANA = makeProfile({ id: 'u-ana', nome: 'Ana', username: 'ana' });

let logado = MARIA.id;
const categorias = createFakeCategoriasTable();
const lancamentos = createFakeLancamentosTable(
  () => categorias.rows,
  () => logado,
);
const resumo = createFakeResumo();

const CAT_MARIA = makeCategoria({ id: 'cat-m', user_id: 'u-maria', nome: 'Sanduíche' });
const CAT_JOAO_PIZZA = makeCategoria({
  id: 'cat-jp',
  user_id: 'u-joao',
  nome: 'Pizza',
  valor_unitario: 5,
});
const CAT_JOAO_AGUA = makeCategoria({
  id: 'cat-ja',
  user_id: 'u-joao',
  nome: 'Água',
  valor_unitario: 1,
});
const CAT_ANA = makeCategoria({ id: 'cat-a', user_id: 'u-ana', nome: 'Marmita' });

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
  return { user, queryClient };
}

function entrarComo(profile: typeof MARIA) {
  logado = profile.id;
  fakeSupabase.setPersistedSession(profile);
  resumo.setAuth(profile.id, profile.role !== 'user');
}

describe('gestor lança, ajusta categorias e vê relatório de outro atendente', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date(2026, 10, 20, 12, 0, 0));
    fakeSupabase.reset();
    categorias.reset();
    lancamentos.reset();
    resumo.reset();
    fakeSupabase.addProfiles(MARIA, JOAO, ANA);
    fakeSupabase.setTableHandler('categorias', categorias.handler);
    fakeSupabase.setTableHandler('lancamentos', lancamentos.handler);
    fakeSupabase.setRpcHandler('autores', (args) => {
      const ids = Array.isArray(args.p_ids) ? (args.p_ids as string[]) : [];
      const nomes: Record<string, string> = { 'u-maria': 'Maria', 'u-ana': 'Ana' };
      return {
        data: ids.filter((id) => nomes[id]).map((id) => ({ id, nome: nomes[id] })),
        error: null,
      };
    });
    resumo.register(fakeSupabase);
    categorias.seed([CAT_MARIA, CAT_JOAO_PIZZA, CAT_JOAO_AGUA, CAT_ANA]);
    entrarComo(MARIA);
  });

  afterEach(() => vi.useRealTimers());

  it('seletor: "Eu" primeiro e perfis ativos; escolher João troca as categorias', async () => {
    const { user } = abrir('/');
    expect(await screen.findByLabelText('Sanduíche')).toBeInTheDocument();
    expect(screen.queryByLabelText('Pizza')).not.toBeInTheDocument();
    expect(screen.queryByText(/como gestor para/)).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Lançando para: Eu' }));
    const sheet = screen.getByRole('dialog', { name: 'Escolher atendente' });
    const opcoes = await within(sheet).findAllByRole('button', { name: /Eu|João|Ana/ });
    expect(opcoes.map((b) => b.textContent)).toEqual([
      expect.stringContaining('Eu'),
      expect.stringContaining('Ana'),
      expect.stringContaining('João'),
    ]);
    await user.click(within(sheet).getByRole('button', { name: /João/ }));

    expect(url()).toBe('/?usuario=u-joao');
    expect(await screen.findByLabelText('Pizza')).toBeInTheDocument();
    expect(screen.queryByLabelText('Sanduíche')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Lançando para: João' })).toBeInTheDocument();
    expect(screen.getByText(/Você está lançando como gestor para/)).toHaveTextContent(
      'Você está lançando como gestor para João',
    );
  });

  it('lança 5 Pizzas para o João: insert com user_id do João, lista do João e selo "por Maria"', async () => {
    const { user, queryClient } = abrir('/?usuario=u-joao');
    const invalidate = vi.spyOn(queryClient, 'invalidateQueries');
    const pizza = await screen.findByLabelText('Pizza');
    await user.clear(pizza);
    await user.type(pizza, '5');
    await user.click(screen.getByRole('button', { name: 'Salvar' }));

    expect(await screen.findByText('Lançamentos salvos — R$ 25,00')).toBeInTheDocument();
    expect(lancamentos.inserts[0]).toEqual([
      { user_id: 'u-joao', data: '2026-11-20', categoria_id: 'cat-jp', quantidade: 5 },
    ]);
    expect(lancamentos.rows[0]).toMatchObject({ user_id: 'u-joao', criado_por: 'u-maria' });
    expect(invalidate).toHaveBeenCalledWith({
      queryKey: ['lancamentos', 'u-joao', '2026-11-20'],
    });

    const lista = await screen.findByRole('list', { name: 'Já lançado hoje' });
    expect(await within(lista).findByTestId('selo-autor')).toHaveTextContent('por Maria');
    // A lista do dia filtra pelo alvo.
    expect(lancamentos.selects.at(-1)).toMatchObject({ user_id: 'u-joao', data: '2026-11-20' });
    expect(categorias.selects.at(-1)).toMatchObject({ user_id: 'u-joao', ativa: true });
  });

  it('faixa do gestor e faixa da data convivem', async () => {
    const { user } = abrir('/?usuario=u-joao');
    await screen.findByLabelText('Pizza');
    await user.click(screen.getByRole('button', { name: 'Dia anterior' }));
    const status = screen.getAllByRole('status').map((s) => s.textContent);
    expect(status).toEqual(
      expect.arrayContaining([
        expect.stringContaining('Você está lançando como gestor para João'),
        expect.stringContaining('Lançando para'),
      ]),
    );
    await user.click(screen.getByRole('button', { name: 'Voltar para mim' }));
    expect(url()).toBe('/');
    expect(await screen.findByLabelText('Sanduíche')).toBeInTheDocument();
  });

  it('edita e exclui um lançamento do João', async () => {
    lancamentos.seed([
      makeLancamento({
        id: 'l1',
        user_id: 'u-joao',
        criado_por: 'u-joao',
        categoria_id: 'cat-jp',
        data: '2026-11-20',
        quantidade: 2,
        valor_unitario: 5,
      }),
    ]);
    const { user } = abrir('/?usuario=u-joao');
    await user.click(await screen.findByRole('button', { name: /Editar Pizza/ }));
    const sheet = screen.getByRole('dialog', { name: 'Editar Pizza' });
    const qtd = within(sheet).getByLabelText('Quantidade');
    await user.clear(qtd);
    await user.type(qtd, '3');
    await user.click(within(sheet).getByRole('button', { name: 'Salvar' }));
    expect(await screen.findByText('Lançamento atualizado.')).toBeInTheDocument();
    expect(lancamentos.rows[0]).toMatchObject({ quantidade: 3, valor_total: 15 });

    await user.click(await screen.findByRole('button', { name: /Editar Pizza, 3/ }));
    await user.click(
      within(screen.getByRole('dialog', { name: 'Editar Pizza' })).getByRole('button', {
        name: 'Excluir',
      }),
    );
    await user.click(
      within(screen.getByRole('alertdialog')).getByRole('button', { name: 'Excluir' }),
    );
    await waitFor(() => expect(lancamentos.rows).toHaveLength(0));
  });

  it('Categorias do João: lista, cria com user_id do João e checa duplicado na lista dele', async () => {
    const { user } = abrir('/categorias?usuario=u-joao');
    const ativas = await screen.findByRole('list', { name: 'Categorias ativas' });
    expect(within(ativas).getByText('Pizza')).toBeInTheDocument();
    expect(within(ativas).queryByText('Sanduíche')).not.toBeInTheDocument();
    expect(screen.getByText(/Você está vendo como gestor para/)).toHaveTextContent('João');
    expect(categorias.selects.at(-1)).toEqual({ user_id: 'u-joao' });

    // "Pizza" já existe para o João → erro abaixo do campo, sem request.
    await user.click(screen.getByRole('button', { name: 'Nova categoria' }));
    let sheet = screen.getByRole('dialog', { name: 'Nova categoria' });
    await user.type(within(sheet).getByLabelText('Nome'), 'Pizza');
    await user.type(within(sheet).getByLabelText('Valor por entrega (R$)'), '5');
    await user.click(within(sheet).getByRole('button', { name: 'Salvar' }));
    expect(within(sheet).getByText(/Já existe uma categoria/)).toBeInTheDocument();
    expect(categorias.inserts).toHaveLength(0);

    // "Sanduíche" só existe para a Maria → pode criar para o João.
    await user.clear(within(sheet).getByLabelText('Nome'));
    await user.type(within(sheet).getByLabelText('Nome'), 'Sanduíche');
    await user.click(within(sheet).getByRole('button', { name: 'Salvar' }));
    expect(await screen.findByText('Categoria criada.')).toBeInTheDocument();
    expect(categorias.inserts[0]).toMatchObject({ user_id: 'u-joao', nome: 'Sanduíche' });

    // Reajusta o preço da Pizza do João.
    await user.click(await screen.findByRole('button', { name: /Pizza/ }));
    sheet = screen.getByRole('dialog', { name: 'Editar categoria' });
    const valor = within(sheet).getByLabelText('Valor por entrega (R$)');
    await user.clear(valor);
    await user.type(valor, '6');
    await user.click(within(sheet).getByRole('button', { name: 'Salvar' }));
    expect(await screen.findByText('Categoria salva.')).toBeInTheDocument();
    expect(categorias.rows.find((c) => c.id === 'cat-jp')?.valor_unitario).toBe(6);
  });

  it('Relatório do João envia p_usuario; trocar de atendente limpa cats e mantém o período', async () => {
    resumo.seed([
      {
        user_id: 'u-joao',
        categoria_id: 'cat-jp',
        nome: 'Pizza',
        data: '2026-11-20',
        quantidade: 20,
        valor_unitario_centavos: 500,
      },
      {
        user_id: 'u-ana',
        categoria_id: 'cat-a',
        nome: 'Marmita',
        data: '2026-11-20',
        quantidade: 10,
        valor_unitario_centavos: 300,
      },
    ]);
    const { user } = abrir('/relatorio?periodo=semana&usuario=u-joao&cats=cat-jp');
    expect(await screen.findByText('R$ 100,00', { selector: 'p' })).toBeInTheDocument();
    expect(resumo.calls.at(-1)).toMatchObject({ usuario: 'u-joao', categorias: ['cat-jp'] });
    expect(screen.getByRole('button', { name: 'Relatório de: João' })).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Relatório de: João' }));
    await user.click(
      within(screen.getByRole('dialog', { name: 'Escolher atendente' })).getByRole('button', {
        name: /Ana/,
      }),
    );
    expect(url()).toBe('/relatorio?periodo=semana&usuario=u-ana');
    expect(await screen.findByText('R$ 30,00', { selector: 'p' })).toBeInTheDocument();
    expect(resumo.calls.at(-1)).toEqual({
      fn: expect.any(String),
      de: '2026-11-16',
      ate: '2026-11-22',
      usuario: 'u-ana',
    });

    // Trocar o período preserva o atendente.
    await user.click(screen.getByRole('button', { name: 'Mês' }));
    expect(url()).toBe('/relatorio?periodo=mes&usuario=u-ana');
  });
});

describe('selo "por <nome>" para o atendente', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date(2026, 10, 20, 12, 0, 0));
    fakeSupabase.reset();
    categorias.reset();
    lancamentos.reset();
    fakeSupabase.setTableHandler('categorias', categorias.handler);
    fakeSupabase.setTableHandler('lancamentos', lancamentos.handler);
    fakeSupabase.setRpcHandler('autores', () => ({
      data: [{ id: 'u-maria', nome: 'Maria' }],
      error: null,
    }));
    categorias.seed([CAT_JOAO_PIZZA, CAT_JOAO_AGUA]);
    entrarComo(JOAO);
  });

  afterEach(() => vi.useRealTimers());

  it('aparece só quando criado_por ≠ user_id, com uma única chamada a autores', async () => {
    lancamentos.seed([
      makeLancamento({
        id: 'l1',
        user_id: 'u-joao',
        criado_por: 'u-maria',
        categoria_id: 'cat-jp',
        data: '2026-11-20',
        created_at: '2026-11-20T10:00:00Z',
      }),
      makeLancamento({
        id: 'l2',
        user_id: 'u-joao',
        criado_por: 'u-maria',
        categoria_id: 'cat-ja',
        data: '2026-11-20',
        created_at: '2026-11-20T10:00:01Z',
      }),
      makeLancamento({
        id: 'l3',
        user_id: 'u-joao',
        criado_por: 'u-joao',
        categoria_id: 'cat-ja',
        data: '2026-11-20',
        created_at: '2026-11-20T10:00:02Z',
      }),
      makeLancamento({
        id: 'l4',
        user_id: 'u-joao',
        criado_por: null,
        categoria_id: 'cat-ja',
        data: '2026-11-20',
        created_at: '2026-11-20T10:00:03Z',
      }),
    ]);
    abrir('/?usuario=u-ana');
    const lista = await screen.findByRole('list', { name: 'Já lançado hoje' });
    // Atendente: ?usuario é ignorado, nada de seletor.
    expect(screen.queryByRole('button', { name: /Lançando para:/ })).not.toBeInTheDocument();
    await waitFor(() => expect(within(lista).getAllByTestId('selo-autor')).toHaveLength(2));
    const itens = within(lista).getAllByRole('listitem');
    expect(itens[0]).toHaveTextContent('por Maria');
    expect(itens[2]).not.toHaveTextContent('por ');
    expect(itens[3]).not.toHaveTextContent('por ');
    const chamadas = fakeSupabase.rpc.mock.calls.filter(([fn]) => fn === 'autores');
    expect(chamadas).toEqual([['autores', { p_ids: ['u-maria'] }]]);
  });
});
