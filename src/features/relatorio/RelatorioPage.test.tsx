import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter, useLocation } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ToastProvider } from '@/components/ui';
import { AuthProvider } from '@/features/auth/AuthProvider';
import { createQueryClient } from '@/lib/queryClient';
import { AppRoutes } from '@/routes/AppRoutes';
import { fakeSupabase, makeProfile } from '@/test/supabaseMock';
import { PERIODO_MESSAGES } from './periodos';
import { createFakeResumo, type FakeLancamento } from './testing/fakeResumo';

vi.mock('@/lib/supabase', async () => ({
  supabase: (await import('@/test/supabaseMock')).fakeSupabase.client,
}));

const resumo = createFakeResumo();

/** Mostra a URL atual (pathname + search) para conferir a sincronização do filtro. */
function LocationProbe() {
  const { pathname, search } = useLocation();
  return <output data-testid="location">{`${pathname}${search}`}</output>;
}

/** Monta o app na URL e espera a sessão carregar (chips visíveis). */
async function abrir(path = '/relatorio') {
  const queryClient = createQueryClient();
  queryClient.setDefaultOptions({ queries: { retry: false }, mutations: { retry: false } });
  const user = userEvent.setup();
  const utils = render(
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
  return { ...utils, user };
}

const url = () => screen.getByTestId('location').textContent;

const SANDUICHE = { categoria_id: 'cat-s', nome: 'Sanduíche', valor_unitario_centavos: 250 };
const PIZZA = { categoria_id: 'cat-p', nome: 'Pizza', valor_unitario_centavos: 500 };

/** 50 Sanduíche × 2,50 + 20 Pizza × 5,00 hoje (20/11/2026). */
const EXEMPLO: FakeLancamento[] = [
  { ...SANDUICHE, data: '2026-11-20', quantidade: 30 },
  { ...SANDUICHE, data: '2026-11-20', quantidade: 20 },
  { ...PIZZA, data: '2026-11-20', quantidade: 20 },
];

async function linhaCategoria(nome: string) {
  const lista = await screen.findByRole('list', { name: 'Por categoria' });
  const item = within(lista)
    .getAllByRole('listitem')
    .find((li) => within(li).queryByText(nome));
  if (!item) throw new Error(`Categoria não encontrada: ${nome}`);
  return item;
}

describe('RelatorioPage', () => {
  beforeEach(() => {
    // Só o Date é falso: timers reais para o userEvent e o TanStack Query.
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date(2026, 10, 20, 10, 0));
    fakeSupabase.reset();
    resumo.reset();
    fakeSupabase.setPersistedSession(makeProfile());
    resumo.register(fakeSupabase);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('com 50 Sanduíche × 2,50 + 20 Pizza × 5,00 mostra total R$ 225,00 e os valores por categoria', async () => {
    resumo.seed(EXEMPLO);
    const release = resumo.hold();
    await abrir('/relatorio?periodo=hoje');

    expect(await screen.findByText('Carregando relatório…')).toBeInTheDocument();
    release();

    const total = await screen.findByRole('region', { name: 'Total no período' });
    expect(within(total).getByText('R$ 225,00')).toBeInTheDocument();
    expect(within(total).getByText('70 entregas')).toBeInTheDocument();

    const sanduiche = await linhaCategoria('Sanduíche');
    expect(within(sanduiche).getByText('50 un')).toBeInTheDocument();
    expect(within(sanduiche).getByText('R$ 125,00')).toBeInTheDocument();
    const pizza = await linhaCategoria('Pizza');
    expect(within(pizza).getByText('20 un')).toBeInTheDocument();
    expect(within(pizza).getByText('R$ 100,00')).toBeInTheDocument();

    // Ordem por valor desc e barra proporcional ao total.
    const itens = within(screen.getByRole('list', { name: 'Por categoria' })).getAllByRole(
      'listitem',
    );
    expect(itens[0]).toBe(sanduiche);
    expect(within(sanduiche).getByTestId('barra')).toHaveStyle({ width: '56%' });
    expect(within(pizza).getByTestId('barra')).toHaveStyle({ width: '44%' });

    const dias = screen.getByRole('list', { name: 'Por dia' });
    const hoje = within(dias).getByRole('listitem');
    expect(within(hoje).getByText('Hoje')).toBeInTheDocument();
    expect(within(hoje).getByText('70 un')).toBeInTheDocument();
    expect(within(hoje).getByText('R$ 225,00')).toBeInTheDocument();

    expect(resumo.calls).toEqual(
      expect.arrayContaining([
        { fn: 'resumo_por_categoria', de: '2026-11-20', ate: '2026-11-20' },
        { fn: 'resumo_por_dia', de: '2026-11-20', ate: '2026-11-20' },
      ]),
    );
  });

  it('padrão é Mês: chip marcado, intervalo em dd/MM/yyyy e dias como Hoje/Ontem/dd/MM', async () => {
    resumo.seed([
      ...EXEMPLO,
      { ...PIZZA, data: '2026-11-19', quantidade: 2 },
      { ...SANDUICHE, data: '2026-11-03', quantidade: 4 },
    ]);
    await abrir();

    const chips = screen.getByRole('group', { name: 'Período' });
    expect(within(chips).getByRole('button', { name: 'Mês' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    expect(screen.getByText('01/11/2026 – 30/11/2026')).toBeInTheDocument();

    const dias = await screen.findByRole('list', { name: 'Por dia' });
    expect(
      within(dias)
        .getAllByRole('listitem')
        .map((li) => li.querySelector('time')?.textContent),
    ).toEqual(['Hoje', 'Ontem', '03/11']);
    expect(resumo.calls).toContainEqual({
      fn: 'resumo_por_categoria',
      de: '2026-11-01',
      ate: '2026-11-30',
    });
  });

  it('marca categoria inativa com lançamentos no período', async () => {
    resumo.seed([
      ...EXEMPLO,
      {
        categoria_id: 'cat-h',
        nome: 'Hot-dog',
        ativa: false,
        data: '2026-11-10',
        quantidade: 3,
        valor_unitario_centavos: 300,
      },
    ]);
    await abrir();
    const hotdog = await linhaCategoria('Hot-dog');
    expect(within(hotdog).getByText('inativa')).toBeInTheDocument();
    expect(within(hotdog).getByText('R$ 9,00')).toBeInTheDocument();
    expect(within(await linhaCategoria('Pizza')).queryByText('inativa')).not.toBeInTheDocument();
  });

  it('lê o filtro da URL (?periodo= e ?de&ate)', async () => {
    resumo.seed(EXEMPLO);
    const { unmount } = await abrir('/relatorio?periodo=semana');
    const chips = screen.getByRole('group', { name: 'Período' });
    expect(within(chips).getByRole('button', { name: 'Semana' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    expect(screen.getByText('16/11/2026 – 22/11/2026')).toBeInTheDocument();
    await screen.findByRole('region', { name: 'Total no período' });
    unmount();

    await abrir('/relatorio?de=2026-10-05&ate=2026-10-20');
    expect(
      within(screen.getByRole('group', { name: 'Período' })).getByRole('button', {
        name: 'Período',
      }),
    ).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByText('05/10/2026 – 20/10/2026')).toBeInTheDocument();
    await waitFor(() =>
      expect(resumo.calls).toContainEqual({
        fn: 'resumo_por_dia',
        de: '2026-10-05',
        ate: '2026-10-20',
      }),
    );
  });

  it('escreve o filtro na URL e o reload mantém o filtro', async () => {
    resumo.seed(EXEMPLO);
    const { user, unmount } = await abrir();
    await screen.findByRole('region', { name: 'Total no período' });

    await user.click(screen.getByRole('button', { name: 'Hoje' }));
    expect(url()).toBe('/relatorio?periodo=hoje');
    expect(screen.getByText('20/11/2026')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Período' }));
    const sheet = await screen.findByRole('dialog', { name: 'Escolher período' });
    fireEvent.change(within(sheet).getByLabelText('De'), { target: { value: '2026-11-02' } });
    fireEvent.change(within(sheet).getByLabelText('Até'), { target: { value: '2026-11-08' } });
    await user.click(within(sheet).getByRole('button', { name: 'Ver relatório' }));

    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    const atual = url();
    expect(atual).toBe('/relatorio?de=2026-11-02&ate=2026-11-08');
    expect(screen.getByText('02/11/2026 – 08/11/2026')).toBeInTheDocument();

    // "Reload": monta o app de novo na mesma URL.
    unmount();
    await abrir(atual ?? '');
    expect(screen.getByText('02/11/2026 – 08/11/2026')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Período' })).toHaveAttribute('aria-pressed', 'true');
  });

  it('período sem lançamentos mostra o estado vazio', async () => {
    resumo.seed([{ ...PIZZA, data: '2026-10-10', quantidade: 1 }]);
    await abrir();
    expect(
      await screen.findByRole('heading', { name: 'Nenhum lançamento neste período' }),
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Lançar entregas' })).toBeInTheDocument();
    expect(screen.queryByRole('region', { name: 'Total no período' })).not.toBeInTheDocument();
  });

  it('bloqueia período personalizado com início > fim', async () => {
    resumo.seed(EXEMPLO);
    const { user } = await abrir();
    await screen.findByRole('region', { name: 'Total no período' });
    const chamadas = resumo.calls.length;

    await user.click(screen.getByRole('button', { name: 'Período' }));
    const sheet = await screen.findByRole('dialog', { name: 'Escolher período' });
    const de = within(sheet).getByLabelText('De');
    const ate = within(sheet).getByLabelText('Até');
    expect(de).toHaveAttribute('type', 'date');
    expect(de).toHaveAttribute('max', '2026-11-20');
    expect(ate).toHaveAttribute('max', '2026-11-20');

    fireEvent.change(de, { target: { value: '2026-11-15' } });
    fireEvent.change(ate, { target: { value: '2026-11-10' } });
    await user.click(within(sheet).getByRole('button', { name: 'Ver relatório' }));

    expect(await within(sheet).findByText(PERIODO_MESSAGES.ordem)).toBeInTheDocument();
    expect(ate).toHaveAttribute('aria-invalid', 'true');
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(url()).toBe('/relatorio');
    expect(resumo.calls.length).toBe(chamadas);
  });

  it('URL com período inválido cai no Mês sem chamar a RPC com ele', async () => {
    resumo.seed(EXEMPLO);
    await abrir('/relatorio?de=2026-11-15&ate=2026-11-10');
    expect(screen.getByRole('button', { name: 'Mês' })).toHaveAttribute('aria-pressed', 'true');
    await screen.findByRole('region', { name: 'Total no período' });
    expect(resumo.calls.every((c) => c.de === '2026-11-01' && c.ate === '2026-11-30')).toBe(true);
  });

  it('erro de rede mostra "Tentar de novo" e recarrega', async () => {
    resumo.seed(EXEMPLO);
    resumo.failNext('08006', 'connection failure');
    const { user } = await abrir();
    expect(
      await screen.findByRole('heading', { name: 'Não foi possível carregar o relatório.' }),
    ).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Tentar de novo' }));
    const total = await screen.findByRole('region', { name: 'Total no período' });
    expect(within(total).getByText('R$ 225,00')).toBeInTheDocument();
  });
});
