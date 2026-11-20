/**
 * Privacidade do atendente perante o gerente (spec 011, T011.5): switch "Visível
 * para <gerente>", Mostrar/Ocultar todas, e o que o gerente deixa de ver
 * (aba Despesas, tipo do Relatório e da Equipe). App inteiro com o Supabase falso
 * e a RLS da 0009 simulada pela tabela de categorias.
 */
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ToastProvider } from '@/components/ui';
import { AuthProvider } from '@/features/auth/AuthProvider';
import {
  createFakeCategoriasDespesaTable,
  createFakeDespesasTable,
  createFakeResumoDespesas,
} from '@/features/despesas/testing/fakeDespesas';
import type { Perfil } from '@/features/equipe/api';
import { createFakeEquipe } from '@/features/equipe/testing/fakeEquipe';
import { createFakeResumo } from '@/features/relatorio/testing/fakeResumo';
import { createQueryClient } from '@/lib/queryClient';
import { AppRoutes } from '@/routes/AppRoutes';
import { fakeSupabase, makeProfile } from '@/test/supabaseMock';
import { createFakeCategoriasTable, makeCategoria } from './testing/fakeCategoriasTable';

vi.mock('@/lib/supabase', async () => ({
  supabase: (await import('@/test/supabaseMock')).fakeSupabase.client,
}));

const MARIA = makeProfile({ id: 'u-maria', nome: 'Maria', username: 'maria', role: 'gerente' });
const JOAO = makeProfile({
  id: 'u-joao',
  nome: 'João',
  username: 'joao',
  role: 'user',
  gerente_id: 'u-maria',
});
const ADMIN = makeProfile({ id: 'u-admin', nome: 'Admin', username: 'admin', role: 'admin' });
const PERFIS = [MARIA, JOAO].map(
  (p) =>
    ({
      id: p.id,
      nome: p.nome,
      username: p.username,
      role: p.role,
      ativo: true,
      gerente_id: p.gerente_id,
      created_at: p.created_at,
    }) as Perfil,
);

const categorias = createFakeCategoriasTable();
const catsDespesa = createFakeCategoriasDespesaTable();
const despesas = createFakeDespesasTable(() => catsDespesa.rows);
const resumoDespesas = createFakeResumoDespesas(
  () => despesas.rows,
  () => catsDespesa.rows,
  () => PERFIS,
);
const resumo = createFakeResumo();
const equipe = createFakeEquipe();

const PIZZA = makeCategoria({ id: 'pizza', user_id: 'u-joao', nome: 'Pizza', valor_unitario: 5 });
const SANDUICHE = makeCategoria({ id: 'sand', user_id: 'u-joao', nome: 'Sanduíche' });

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
          </MemoryRouter>
        </AuthProvider>
      </ToastProvider>
    </QueryClientProvider>,
  );
  return user;
}

/** Quem está logado: o papel decide a RLS simulada e a RPC `meu_gerente`. */
function entrarComo(perfil: typeof MARIA, opts: { meuGerente?: boolean } = {}) {
  fakeSupabase.setPersistedSession(perfil);
  fakeSupabase.addProfiles(MARIA, JOAO, ADMIN);
  const gerente = opts.meuGerente ? [{ id: 'u-maria', nome: 'Maria', username: 'maria' }] : [];
  fakeSupabase.setRpcHandler('meu_gerente', () => ({ data: gerente, error: null }));
  categorias.setVisao({
    uid: perfil.id,
    admin: perfil.role === 'admin',
    atendentes: perfil.role === 'gerente' ? ['u-joao'] : [],
  });
  resumo.setAuth(perfil.id, perfil.role !== 'user');
  resumoDespesas.setAuth(perfil.id, perfil.role !== 'user');
}

const chamadasRpc = () => fakeSupabase.rpc.mock.calls.map((c) => c[0]);

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date(2026, 10, 20, 12, 0, 0));
  fakeSupabase.reset();
  categorias.reset();
  catsDespesa.reset();
  despesas.reset();
  resumo.reset();
  resumoDespesas.reset();
  equipe.reset();
  fakeSupabase.setTableHandler('categorias', categorias.handler);
  fakeSupabase.setTableHandler('categorias_despesa', catsDespesa.handler);
  resumo.register(fakeSupabase);
  resumoDespesas.register(fakeSupabase);
  equipe.register(fakeSupabase);
  categorias.seed([PIZZA, SANDUICHE]);
});
afterEach(() => vi.useRealTimers());

function itemDe(lista: HTMLElement, nome: RegExp): HTMLElement {
  const li = within(lista).getByRole('button', { name: nome }).closest('li');
  if (!li) throw new Error('item não encontrado');
  return li;
}

describe('Categorias: o atendente (dono) com gerente', () => {
  it('mostra o aviso e um switch "Visível para Maria" por categoria, desligado', async () => {
    entrarComo(JOAO, { meuGerente: true });
    abrir('/categorias');
    expect(
      await screen.findByText('Seu gerente Maria só vê as categorias marcadas.'),
    ).toBeVisible();
    const switches = await screen.findAllByRole('switch', { name: 'Visível para Maria' });
    expect(switches).toHaveLength(2);
    switches.forEach((s) => expect(s).toHaveAttribute('aria-checked', 'false'));
  });

  it('tocar no switch atualiza visivel_gerente sem abrir o sheet de edição', async () => {
    entrarComo(JOAO, { meuGerente: true });
    const user = abrir('/categorias');
    const lista = await screen.findByRole('list', { name: 'Categorias ativas' });
    const item = itemDe(lista, /Editar Pizza/);
    await user.click(within(item).getByRole('switch', { name: 'Visível para Maria' }));

    await waitFor(() =>
      expect(categorias.rows.find((r) => r.id === 'pizza')?.visivel_gerente).toBe(true),
    );
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    await waitFor(() =>
      expect(within(item).getByRole('switch')).toHaveAttribute('aria-checked', 'true'),
    );
    expect(categorias.rows.find((r) => r.id === 'sand')?.visivel_gerente).toBe(false);
  });

  it('desfaz o switch e avisa quando o servidor recusa', async () => {
    entrarComo(JOAO, { meuGerente: true });
    const user = abrir('/categorias');
    const lista = await screen.findByRole('list', { name: 'Categorias ativas' });
    const item = itemDe(lista, /Editar Pizza/);
    categorias.failNext('500', 'falhou');
    await user.click(within(item).getByRole('switch', { name: 'Visível para Maria' }));

    expect(
      await screen.findByText('Não foi possível alterar a visibilidade. Tente de novo.'),
    ).toBeInTheDocument();
    await waitFor(() =>
      expect(within(item).getByRole('switch')).toHaveAttribute('aria-checked', 'false'),
    );
    expect(categorias.rows.find((r) => r.id === 'pizza')?.visivel_gerente).toBe(false);
  });

  it('"Mostrar todas" e "Ocultar todas" confirmam e atualizam em lote', async () => {
    entrarComo(JOAO, { meuGerente: true });
    const user = abrir('/categorias');
    await user.click(await screen.findByRole('button', { name: 'Mostrar todas' }));
    const dialogo = await screen.findByRole('alertdialog', { name: 'Mostrar todas?' });
    // Cancelar não muda nada.
    await user.click(within(dialogo).getByRole('button', { name: 'Cancelar' }));
    expect(categorias.rows.every((r) => !r.visivel_gerente)).toBe(true);

    await user.click(screen.getByRole('button', { name: 'Mostrar todas' }));
    await user.click(
      within(await screen.findByRole('alertdialog', { name: 'Mostrar todas?' })).getByRole(
        'button',
        {
          name: 'Mostrar todas',
        },
      ),
    );
    await waitFor(() => expect(categorias.rows.every((r) => r.visivel_gerente)).toBe(true));
    await waitFor(() =>
      screen
        .getAllByRole('switch', { name: 'Visível para Maria' })
        .forEach((s) => expect(s).toHaveAttribute('aria-checked', 'true')),
    );

    await user.click(screen.getByRole('button', { name: 'Ocultar todas' }));
    await user.click(
      within(await screen.findByRole('alertdialog', { name: 'Ocultar todas?' })).getByRole(
        'button',
        {
          name: 'Ocultar todas',
        },
      ),
    );
    await waitFor(() => expect(categorias.rows.every((r) => !r.visivel_gerente)).toBe(true));
  });

  it('o sheet de nova categoria traz o switch desmarcado e envia visivel_gerente', async () => {
    entrarComo(JOAO, { meuGerente: true });
    const user = abrir('/categorias');
    await user.click(await screen.findByRole('button', { name: 'Nova categoria' }));
    const sheet = await screen.findByRole('dialog', { name: 'Nova categoria' });
    const sw = within(sheet).getByRole('switch', { name: 'Visível para Maria' });
    expect(sw).toHaveAttribute('aria-checked', 'false');

    await user.type(within(sheet).getByLabelText('Nome'), 'Marmita');
    await user.type(within(sheet).getByLabelText('Valor por entrega (R$)'), '7');
    await user.click(sw);
    await user.click(within(sheet).getByRole('button', { name: 'Salvar' }));
    await screen.findByText('Categoria criada.');
    expect(categorias.inserts.at(-1)).toMatchObject({ nome: 'Marmita', visivel_gerente: true });
  });

  it('o sheet de edição reflete e grava a visibilidade', async () => {
    categorias.seed([{ ...PIZZA, visivel_gerente: true }, SANDUICHE]);
    entrarComo(JOAO, { meuGerente: true });
    const user = abrir('/categorias');
    await user.click(await screen.findByRole('button', { name: /Editar Pizza/ }));
    const sheet = await screen.findByRole('dialog', { name: 'Editar categoria' });
    const sw = within(sheet).getByRole('switch', { name: 'Visível para Maria' });
    expect(sw).toHaveAttribute('aria-checked', 'true');
    await user.click(sw);
    await user.click(within(sheet).getByRole('button', { name: 'Salvar' }));
    await screen.findByText('Categoria salva.');
    expect(categorias.rows.find((r) => r.id === 'pizza')?.visivel_gerente).toBe(false);
  });
});

describe('Categorias: sem gerente, e visões do gerente e do admin', () => {
  it('atendente sem gerente não vê aviso, switch nem Mostrar/Ocultar todas', async () => {
    entrarComo(JOAO);
    abrir('/categorias');
    await screen.findByRole('list', { name: 'Categorias ativas' });
    expect(screen.queryByRole('switch')).not.toBeInTheDocument();
    expect(screen.queryByText(/só vê as categorias marcadas/)).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Mostrar todas' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Ocultar todas' })).not.toBeInTheDocument();
  });

  it('gerente vendo o atendente: só as liberadas, com nota, sem switch e sem aba Despesas', async () => {
    categorias.seed([{ ...PIZZA, visivel_gerente: true }, SANDUICHE]);
    entrarComo(MARIA);
    abrir('/categorias?usuario=u-joao');
    const lista = await screen.findByRole('list', { name: 'Categorias ativas' });
    expect(
      within(lista)
        .getAllByRole('button')
        .map((b) => b.getAttribute('aria-label')),
    ).toEqual(['Editar Pizza, R$ 5,00']);
    expect(screen.getByText('Você vê apenas as categorias liberadas por João.')).toBeVisible();
    expect(screen.queryByRole('switch')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Mostrar todas' })).not.toBeInTheDocument();
    expect(screen.queryByRole('tab', { name: 'Despesas' })).not.toBeInTheDocument();
  });

  it('gerente: ?aba=despesas cai em entregas e não consulta categorias de despesa', async () => {
    categorias.seed([{ ...PIZZA, visivel_gerente: true }]);
    entrarComo(MARIA);
    abrir('/categorias?usuario=u-joao&aba=despesas');
    expect(await screen.findByRole('list', { name: 'Categorias ativas' })).toBeInTheDocument();
    expect(screen.queryByRole('tablist')).not.toBeInTheDocument();
    expect(catsDespesa.selects).toHaveLength(0);
  });

  it('gerente sem nenhuma liberada: EmptyState; criar não envia visivel_gerente e nasce visível', async () => {
    entrarComo(MARIA);
    const user = abrir('/categorias?usuario=u-joao');
    expect(
      await screen.findByRole('heading', {
        name: 'João ainda não liberou nenhuma categoria para você.',
      }),
    ).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Nova categoria' }));
    const sheet = await screen.findByRole('dialog', { name: 'Nova categoria' });
    expect(within(sheet).queryByRole('switch', { name: /Visível/ })).not.toBeInTheDocument();
    await user.type(within(sheet).getByLabelText('Nome'), 'Marmita');
    await user.type(within(sheet).getByLabelText('Valor por entrega (R$)'), '7');
    await user.click(within(sheet).getByRole('button', { name: 'Salvar' }));
    await screen.findByText('Categoria criada.');
    expect(categorias.inserts.at(-1)).not.toHaveProperty('visivel_gerente');
    expect(categorias.rows.find((r) => r.nome === 'Marmita')).toMatchObject({
      user_id: 'u-joao',
      visivel_gerente: true,
    });
  });

  it('admin vendo o atendente: tudo (inclusive ocultas), sem switch, com aba Despesas', async () => {
    entrarComo(ADMIN);
    abrir('/categorias?usuario=u-joao');
    const lista = await screen.findByRole('list', { name: 'Categorias ativas' });
    expect(within(lista).getAllByRole('button')).toHaveLength(2);
    expect(screen.queryByRole('switch')).not.toBeInTheDocument();
    expect(screen.queryByText(/Você vê apenas/)).not.toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Despesas' })).toBeInTheDocument();
  });
});

describe('Lançar: gerente vendo o atendente', () => {
  it('sem nenhuma categoria liberada mostra o EmptyState', async () => {
    entrarComo(MARIA);
    abrir('/?usuario=u-joao');
    expect(
      await screen.findByRole('heading', {
        name: 'João ainda não liberou nenhuma categoria para você.',
      }),
    ).toBeInTheDocument();
  });

  it('esconde a aba Despesas e ?aba=despesas cai em Entregas', async () => {
    categorias.seed([{ ...PIZZA, visivel_gerente: true }, SANDUICHE]);
    entrarComo(MARIA);
    abrir('/?usuario=u-joao&aba=despesas');
    expect(await screen.findByLabelText('Pizza')).toBeInTheDocument();
    expect(screen.queryByLabelText('Sanduíche')).not.toBeInTheDocument();
    expect(screen.queryByRole('tab')).not.toBeInTheDocument();
    expect(catsDespesa.selects).toHaveLength(0);
  });

  it('o gerente lançando para si mesmo mantém as duas abas', async () => {
    entrarComo(MARIA);
    abrir('/');
    expect(await screen.findByRole('tab', { name: 'Despesas' })).toBeInTheDocument();
  });
});

describe('Relatório: gerente vendo o atendente', () => {
  it('sem seletor de tipo, com nota, ignorando tipo=despesas e dcats da URL', async () => {
    entrarComo(MARIA);
    resumo.seed([
      {
        data: '2026-11-20',
        categoria_id: 'pizza',
        nome: 'Pizza',
        quantidade: 2,
        valor_unitario_centavos: 500,
        user_id: 'u-joao',
      },
    ]);
    categorias.seed([{ ...PIZZA, visivel_gerente: true }]);
    abrir('/relatorio?usuario=u-joao&tipo=despesas&dcats=nenhuma');
    expect(
      await screen.findByText('Mostrando apenas categorias liberadas por João.'),
    ).toBeVisible();
    expect(screen.queryByRole('group', { name: 'Tipo' })).not.toBeInTheDocument();
    expect((await screen.findAllByText('R$ 10,00')).length).toBeGreaterThan(0);
    expect(chamadasRpc()).toContain('resumo_por_categoria');
    expect(chamadasRpc()).not.toContain('resumo_despesas_por_categoria');
    expect(chamadasRpc()).not.toContain('resumo_despesas_por_dia');
  });

  it('o gerente vendo o próprio relatório mantém o seletor de tipo', async () => {
    entrarComo(MARIA);
    abrir('/relatorio');
    expect(await screen.findByRole('group', { name: 'Tipo' })).toBeInTheDocument();
  });
});

describe('Equipe: gerente x admin', () => {
  beforeEach(() => {
    equipe.seed({
      perfis: PERFIS,
      lancamentos: [
        {
          user_id: 'u-joao',
          data: '2026-11-20',
          categoria: 'Pizza',
          quantidade: 2,
          valor_unitario_centavos: 500,
        },
      ],
    });
  });

  it('gerente: sem seletor de tipo, com subtítulo, só Receitas e filtro só com Entregas', async () => {
    categorias.seed([{ ...PIZZA, visivel_gerente: true }]);
    entrarComo(MARIA);
    const user = abrir('/equipe?tipo=despesas');
    await screen.findAllByTestId('equipe-item');
    expect(screen.queryByRole('group', { name: 'Tipo' })).not.toBeInTheDocument();
    expect(
      screen.getByText('Valores consideram apenas as categorias liberadas por cada atendente.'),
    ).toBeVisible();
    expect(chamadasRpc()).not.toContain('resumo_despesas_por_usuario_nomes');

    await user.click(await screen.findByRole('button', { name: /categorias/i }));
    const sheet = await screen.findByRole('dialog', { name: 'Filtrar categorias' });
    expect(within(sheet).getByRole('checkbox', { name: 'Pizza' })).toBeInTheDocument();
    expect(within(sheet).queryByText('Despesas')).not.toBeInTheDocument();
  });

  it('gerente: o link do atendente vai para o relatório sem tipo', async () => {
    entrarComo(MARIA);
    abrir('/equipe?tipo=ambos');
    const linhas = await screen.findAllByTestId('equipe-item');
    const link = within(linhas[0]).getByRole('link');
    expect(link.getAttribute('href')).toContain('usuario=u-joao');
    expect(link.getAttribute('href')).not.toContain('tipo=');
  });

  it('admin mantém o seletor Receitas | Despesas | Ambos', async () => {
    entrarComo(ADMIN);
    abrir('/equipe');
    const tipo = await screen.findByRole('group', { name: 'Tipo' });
    expect(
      within(tipo)
        .getAllByRole('button')
        .map((b) => b.textContent),
    ).toEqual(['Receitas', 'Despesas', 'Ambos']);
    expect(
      screen.queryByText('Valores consideram apenas as categorias liberadas por cada atendente.'),
    ).not.toBeInTheDocument();
  });
});
