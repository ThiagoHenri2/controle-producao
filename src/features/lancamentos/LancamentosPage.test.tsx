import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fakeSupabase, makeProfile } from '@/test/supabaseMock';
import { renderApp } from '@/test/renderApp';
import {
  createFakeCategoriasTable,
  makeCategoria,
} from '@/features/categorias/testing/fakeCategoriasTable';
import { createFakeLancamentosTable, makeLancamento } from './testing/fakeLancamentosTable';

vi.mock('@/lib/supabase', async () => ({
  supabase: (await import('@/test/supabaseMock')).fakeSupabase.client,
}));

const categorias = createFakeCategoriasTable();
const lancamentos = createFakeLancamentosTable(() => categorias.rows);

const SANDUICHE = makeCategoria({ id: 'cat-s', nome: 'Sanduíche', valor_unitario: 2.5 });
const PIZZA = makeCategoria({ id: 'cat-p', nome: 'Pizza', valor_unitario: 5 });
const AGUA = makeCategoria({ id: 'cat-a', nome: 'Água', valor_unitario: 1 });

type User = ReturnType<typeof userEvent.setup>;

function abrir() {
  const user = userEvent.setup();
  const utils = renderApp('/');
  return { user, ...utils };
}

async function digitar(user: User, label: string, valor: string) {
  const input = await screen.findByLabelText(label);
  await user.clear(input);
  await user.type(input, valor);
  return input;
}

const salvar = () => screen.getByRole('button', { name: 'Salvar' });
const rotuloData = () => screen.getByTestId('data-rotulo');
const inputData = () => screen.getByLabelText('Data do lançamento');

describe('LancamentosPage', () => {
  beforeEach(() => {
    // Só o Date é falso: 20/11/2026 (sexta), meio-dia local.
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date(2026, 10, 20, 12, 0, 0));
    fakeSupabase.reset();
    categorias.reset();
    lancamentos.reset();
    fakeSupabase.setPersistedSession(makeProfile());
    fakeSupabase.setTableHandler('categorias', categorias.handler);
    fakeSupabase.setTableHandler('lancamentos', lancamentos.handler);
    categorias.seed([SANDUICHE, PIZZA, AGUA]);
  });

  afterEach(() => vi.useRealTimers());

  it('abre em hoje, com ▶ desabilitado e sem a faixa "Lançando para"', async () => {
    abrir();
    await screen.findByLabelText('Sanduíche');
    expect(rotuloData()).toHaveTextContent('Hoje, 20/11/2026');
    expect(inputData()).toHaveValue('2026-11-20');
    expect(inputData()).toHaveAttribute('max', '2026-11-20');
    expect(screen.getByRole('button', { name: 'Próximo dia' })).toBeDisabled();
    expect(screen.queryByText(/Lançando para/)).not.toBeInTheDocument();
  });

  it('subtotal ao vivo em centavos: 50 × 2,50 + 20 × 5,00 = R$ 225,00', async () => {
    const { user } = abrir();
    expect(await screen.findByTestId('subtotal')).toHaveTextContent('R$ 0,00');
    await digitar(user, 'Sanduíche', '50');
    await digitar(user, 'Pizza', '20');
    expect(screen.getByTestId('subtotal')).toHaveTextContent('R$ 225,00');
    expect(screen.getByLabelText('Sanduíche')).toHaveAttribute('inputmode', 'numeric');
  });

  it('Salvar fica desabilitado com tudo zero', async () => {
    const { user } = abrir();
    await screen.findByLabelText('Sanduíche');
    expect(salvar()).toBeDisabled();
    await user.click(screen.getByRole('button', { name: 'Aumentar Pizza' }));
    expect(salvar()).toBeEnabled();
    await user.click(screen.getByRole('button', { name: 'Diminuir Pizza' }));
    expect(salvar()).toBeDisabled();
  });

  it('salva em lote sem valor_unitario, ignora qtd 0, zera os steppers e mostra o total', async () => {
    const { user, queryClient } = abrir();
    const invalidate = vi.spyOn(queryClient, 'invalidateQueries');
    await digitar(user, 'Sanduíche', '50');
    await digitar(user, 'Pizza', '20');
    await user.click(salvar());

    expect(await screen.findByText('Lançamentos salvos — R$ 225,00')).toBeInTheDocument();
    expect(lancamentos.inserts).toHaveLength(1);
    expect(lancamentos.inserts[0]).toEqual([
      { user_id: 'user-1', data: '2026-11-20', categoria_id: 'cat-p', quantidade: 20 },
      { user_id: 'user-1', data: '2026-11-20', categoria_id: 'cat-s', quantidade: 50 },
    ]);
    for (const item of lancamentos.inserts[0]) {
      expect(item).not.toHaveProperty('valor_unitario');
      expect(item).not.toHaveProperty('valor_total');
      expect(item).not.toHaveProperty('criado_por');
    }
    expect(lancamentos.rows.map((r) => r.valor_total)).toEqual([100, 125]);

    expect(screen.getByLabelText('Sanduíche')).toHaveValue('0');
    expect(screen.getByLabelText('Pizza')).toHaveValue('0');
    expect(screen.getByTestId('subtotal')).toHaveTextContent('R$ 0,00');
    expect(await screen.findByTestId('total-dia')).toHaveTextContent('R$ 225,00');
    expect(screen.getByRole('heading', { name: 'Já lançado hoje' })).toBeInTheDocument();

    expect(invalidate).toHaveBeenCalledWith({ queryKey: ['lancamentos', 'user-1', '2026-11-20'] });
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ['resumo'] });
  });

  it('se o insert falhar, mostra erro e mantém os valores digitados', async () => {
    const { user } = abrir();
    await digitar(user, 'Sanduíche', '50');
    await digitar(user, 'Pizza', '20');
    await screen.findByText('Nada lançado neste dia ainda.');
    lancamentos.failNext('', 'TypeError: Failed to fetch');
    await user.click(salvar());

    expect(
      await screen.findByText('Não foi possível salvar. Verifique sua conexão e tente de novo.'),
    ).toBeInTheDocument();
    expect(screen.getByLabelText('Sanduíche')).toHaveValue('50');
    expect(screen.getByLabelText('Pizza')).toHaveValue('20');
    expect(screen.getByTestId('subtotal')).toHaveTextContent('R$ 225,00');
    expect(salvar()).toBeEnabled();
    expect(lancamentos.rows).toHaveLength(0);
  });

  it('◀ vai para ontem, recarrega a lista daquela data e mostra a faixa de alerta', async () => {
    lancamentos.seed([
      makeLancamento({
        id: 'l1',
        categoria_id: 'cat-p',
        data: '2026-11-19',
        quantidade: 3,
        valor_unitario: 5,
      }),
    ]);
    const { user } = abrir();
    await screen.findByText('Nada lançado neste dia ainda.');

    await user.click(screen.getByRole('button', { name: 'Dia anterior' }));
    expect(rotuloData()).toHaveTextContent('Ontem, 19/11/2026');
    expect(screen.getByRole('button', { name: 'Próximo dia' })).toBeEnabled();
    expect(screen.getByText(/Lançando para/)).toHaveTextContent('Lançando para qui, 19/11/2026');
    expect(await screen.findByTestId('total-dia')).toHaveTextContent('R$ 15,00');
    expect(screen.getByRole('heading', { name: 'Já lançado ontem' })).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Dia anterior' }));
    expect(rotuloData()).toHaveTextContent('qua, 18/11/2026');
    expect(
      await screen.findByRole('heading', { name: 'Já lançado em 18/11/2026' }),
    ).toBeInTheDocument();
  });

  it('escolher data passada no calendário envia a data certa e a mantém após salvar', async () => {
    const { user } = abrir();
    await screen.findByLabelText('Sanduíche');
    fireEvent.change(inputData(), { target: { value: '2026-11-15' } });
    expect(rotuloData()).toHaveTextContent('dom, 15/11/2026');
    expect(screen.getByText(/Lançando para/)).toHaveTextContent('dom, 15/11/2026');

    await digitar(user, 'Sanduíche', '50');
    await digitar(user, 'Pizza', '20');
    await user.click(salvar());
    expect(await screen.findByText('Lançamentos salvos em 15/11 — R$ 225,00')).toBeInTheDocument();
    expect(lancamentos.inserts[0].map((i) => i.data)).toEqual(['2026-11-15', '2026-11-15']);
    // A data escolhida continua selecionada para lançar outro dia atrasado em sequência.
    expect(rotuloData()).toHaveTextContent('dom, 15/11/2026');
    expect(inputData()).toHaveValue('2026-11-15');
  });

  it('"Voltar para hoje" volta a data para hoje e some a faixa', async () => {
    const { user } = abrir();
    await screen.findByLabelText('Sanduíche');
    fireEvent.change(inputData(), { target: { value: '2026-10-01' } });
    await user.click(screen.getByRole('button', { name: 'Voltar para hoje' }));
    expect(rotuloData()).toHaveTextContent('Hoje, 20/11/2026');
    expect(screen.queryByText(/Lançando para/)).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Próximo dia' })).toBeDisabled();
  });

  it('não permite data futura (o calendário volta para hoje)', async () => {
    const { user } = abrir();
    await screen.findByLabelText('Sanduíche');
    fireEvent.change(inputData(), { target: { value: '2026-11-25' } });
    expect(rotuloData()).toHaveTextContent('Hoje, 20/11/2026');
    expect(inputData()).toHaveValue('2026-11-20');

    await digitar(user, 'Pizza', '1');
    await user.click(salvar());
    await screen.findByText('Lançamentos salvos — R$ 5,00');
    expect(lancamentos.inserts[0][0].data).toBe('2026-11-20');
  });

  it('editar a quantidade 20 → 25 atualiza o total do dia', async () => {
    lancamentos.seed([
      makeLancamento({ id: 'l1', categoria_id: 'cat-s', quantidade: 30, valor_unitario: 2.5 }),
      makeLancamento({ id: 'l2', categoria_id: 'cat-p', quantidade: 20, valor_unitario: 5 }),
    ]);
    const { user } = abrir();
    expect(await screen.findByTestId('total-dia')).toHaveTextContent('R$ 175,00');

    await user.click(screen.getByRole('button', { name: 'Editar Pizza, 20 × R$ 5,00, R$ 100,00' }));
    const sheet = await screen.findByRole('dialog', { name: 'Editar Pizza' });
    const qtd = within(sheet).getByLabelText('Quantidade');
    expect(qtd).toHaveAttribute('inputmode', 'numeric');
    await user.clear(qtd);
    await user.type(qtd, '25');
    await user.type(within(sheet).getByLabelText('Observação (opcional)'), 'turno da noite');
    await user.click(within(sheet).getByRole('button', { name: 'Salvar' }));

    expect(await screen.findByText('Lançamento atualizado.')).toBeInTheDocument();
    await waitFor(() => expect(screen.getByTestId('total-dia')).toHaveTextContent('R$ 200,00'));
    expect(lancamentos.rows.find((r) => r.id === 'l2')).toMatchObject({
      quantidade: 25,
      valor_unitario: 5,
      observacao: 'turno da noite',
    });
  });

  it('editar valida a quantidade com mensagem abaixo do campo', async () => {
    lancamentos.seed([makeLancamento({ id: 'l1', categoria_id: 'cat-s', quantidade: 3 })]);
    const { user } = abrir();
    await user.click(await screen.findByRole('button', { name: /Editar Sanduíche/ }));
    const sheet = await screen.findByRole('dialog');
    const qtd = within(sheet).getByLabelText('Quantidade');
    await user.clear(qtd);
    await user.type(qtd, '0');
    await user.click(within(sheet).getByRole('button', { name: 'Salvar' }));
    expect(within(sheet).getByText('A quantidade mínima é 1.')).toBeInTheDocument();
    expect(lancamentos.rows[0].quantidade).toBe(3);
  });

  it('excluir pede confirmação', async () => {
    lancamentos.seed([
      makeLancamento({ id: 'l1', categoria_id: 'cat-s', quantidade: 30, valor_unitario: 2.5 }),
    ]);
    const { user } = abrir();
    await user.click(await screen.findByRole('button', { name: /Editar Sanduíche/ }));
    const sheet = await screen.findByRole('dialog');
    await user.click(within(sheet).getByRole('button', { name: 'Excluir' }));

    const confirm = await screen.findByRole('alertdialog', { name: 'Excluir lançamento?' });
    await user.click(within(confirm).getByRole('button', { name: 'Cancelar' }));
    expect(lancamentos.rows).toHaveLength(1);

    await user.click(within(sheet).getByRole('button', { name: 'Excluir' }));
    await user.click(
      within(await screen.findByRole('alertdialog')).getByRole('button', { name: 'Excluir' }),
    );
    expect(await screen.findByText('Lançamento excluído.')).toBeInTheDocument();
    expect(await screen.findByText('Nada lançado neste dia ainda.')).toBeInTheDocument();
    expect(lancamentos.rows).toHaveLength(0);
  });

  it('sem categorias ativas mostra o estado vazio com link para /categorias', async () => {
    categorias.seed([makeCategoria({ id: 'x', nome: 'Antiga', ativa: false })]);
    abrir();
    expect(
      await screen.findByRole('heading', { name: 'Cadastre suas categorias para começar' }),
    ).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Cadastrar categorias' })).toHaveAttribute(
      'href',
      '/categorias',
    );
    expect(screen.queryByRole('button', { name: 'Salvar' })).not.toBeInTheDocument();
  });

  it('só lista categorias ativas', async () => {
    categorias.seed([SANDUICHE, makeCategoria({ id: 'x', nome: 'Antiga', ativa: false })]);
    abrir();
    expect(await screen.findByLabelText('Sanduíche')).toBeInTheDocument();
    expect(screen.queryByLabelText('Antiga')).not.toBeInTheDocument();
  });
});
