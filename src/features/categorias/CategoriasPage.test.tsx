import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fakeSupabase, makeProfile } from '@/test/supabaseMock';
import { renderApp } from '@/test/renderApp';
import { createFakeCategoriasTable, makeCategoria } from './testing/fakeCategoriasTable';

vi.mock('@/lib/supabase', async () => ({
  supabase: (await import('@/test/supabaseMock')).fakeSupabase.client,
}));

const table = createFakeCategoriasTable();

function abrir() {
  const user = userEvent.setup();
  renderApp('/categorias');
  return user;
}

async function preencher(
  user: ReturnType<typeof userEvent.setup>,
  { nome, valor }: { nome?: string; valor?: string },
) {
  const sheet = await screen.findByRole('dialog');
  if (nome !== undefined) {
    const campo = within(sheet).getByLabelText('Nome');
    await user.clear(campo);
    if (nome) await user.type(campo, nome);
  }
  if (valor !== undefined) {
    const campo = within(sheet).getByLabelText('Valor por entrega (R$)');
    await user.clear(campo);
    if (valor) await user.type(campo, valor);
  }
  return sheet;
}

describe('CategoriasPage', () => {
  beforeEach(() => {
    fakeSupabase.reset();
    table.reset();
    fakeSupabase.setPersistedSession(makeProfile());
    fakeSupabase.setTableHandler('categorias', table.handler);
  });

  it('mostra skeleton e depois o estado vazio com chamada para ação', async () => {
    const release = table.hold();
    abrir();
    expect(await screen.findByText('Carregando categorias…')).toBeInTheDocument();
    release();
    expect(
      await screen.findByRole('heading', { name: 'Cadastre sua primeira categoria' }),
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Nova categoria' })).toBeInTheDocument();
  });

  it('cria "Sanduíche 2,50" e "Pizza 5.00" e lista em BRL, sem reload', async () => {
    const user = abrir();
    await user.click(await screen.findByRole('button', { name: 'Nova categoria' }));
    let sheet = await preencher(user, { nome: 'Sanduíche', valor: '2,50' });
    expect(within(sheet).getByLabelText('Valor por entrega (R$)')).toHaveAttribute(
      'inputmode',
      'decimal',
    );
    await user.click(within(sheet).getByRole('button', { name: 'Salvar' }));
    expect(await screen.findByText('Categoria criada.')).toBeInTheDocument();
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());

    await user.click(await screen.findByRole('button', { name: 'Nova categoria' }));
    sheet = await preencher(user, { nome: 'Pizza', valor: '5.00' });
    await user.click(within(sheet).getByRole('button', { name: 'Salvar' }));

    const lista = await screen.findByRole('list', { name: 'Categorias ativas' });
    await waitFor(() =>
      expect(
        within(lista)
          .getAllByRole('button')
          .map((b) => b.getAttribute('aria-label')),
      ).toEqual(['Editar Pizza, R$ 5,00', 'Editar Sanduíche, R$ 2,50']),
    );
    expect(table.rows.map((r) => [r.nome, r.valor_unitario])).toEqual([
      ['Sanduíche', 2.5],
      ['Pizza', 5],
    ]);
  });

  it('bloqueia valor "-1" e "abc" no formulário, sem chamar o servidor', async () => {
    const user = abrir();
    await user.click(await screen.findByRole('button', { name: 'Nova categoria' }));
    let sheet = await preencher(user, { nome: 'Pizza', valor: '-1' });
    await user.click(within(sheet).getByRole('button', { name: 'Salvar' }));
    expect(within(sheet).getByText('O valor não pode ser negativo.')).toBeInTheDocument();
    expect(within(sheet).getByLabelText('Valor por entrega (R$)')).toHaveAttribute(
      'aria-invalid',
      'true',
    );

    sheet = await preencher(user, { valor: 'abc' });
    await user.click(within(sheet).getByRole('button', { name: 'Salvar' }));
    expect(within(sheet).getByText('Valor inválido. Ex.: 2,50')).toBeInTheDocument();

    sheet = await preencher(user, { nome: '', valor: '' });
    await user.click(within(sheet).getByRole('button', { name: 'Salvar' }));
    expect(within(sheet).getByText('Informe o nome.')).toBeInTheDocument();
    expect(within(sheet).getByText('Informe o valor.')).toBeInTheDocument();
    expect(table.rows).toHaveLength(0);
  });

  it('nome duplicado (sem diferenciar maiúsculas) mostra a mensagem amigável', async () => {
    table.seed([makeCategoria({ id: 'p', nome: 'Pizza', valor_unitario: 5 })]);
    const user = abrir();
    await user.click(await screen.findByRole('button', { name: 'Nova categoria' }));
    const sheet = await preencher(user, { nome: ' PIZZA ', valor: '6' });
    await user.click(within(sheet).getByRole('button', { name: 'Salvar' }));
    expect(within(sheet).getByText('Já existe uma categoria com esse nome.')).toBeInTheDocument();
    expect(table.rows).toHaveLength(1);
  });

  it('erro 23505 do banco também vira a mensagem amigável abaixo do nome', async () => {
    const user = abrir();
    await user.click(await screen.findByRole('button', { name: 'Nova categoria' }));
    const sheet = await preencher(user, { nome: 'Pizza', valor: '5' });
    table.failNext(
      '23505',
      'duplicate key value violates unique constraint "categorias_user_id_nome_key"',
    );
    await user.click(within(sheet).getByRole('button', { name: 'Salvar' }));
    expect(
      await within(sheet).findByText('Já existe uma categoria com esse nome.'),
    ).toBeInTheDocument();
    expect(screen.queryByText(/duplicate key/)).not.toBeInTheDocument();
    expect(screen.getByRole('dialog')).toBeInTheDocument();
  });

  it('desabilita o Salvar com spinner durante a mutation', async () => {
    const user = abrir();
    await user.click(await screen.findByRole('button', { name: 'Nova categoria' }));
    const sheet = await preencher(user, { nome: 'Pizza', valor: '5' });
    const release = table.hold();
    await user.click(within(sheet).getByRole('button', { name: 'Salvar' }));
    const salvar = within(sheet).getByRole('button', { name: 'Salvar' });
    expect(salvar).toBeDisabled();
    expect(salvar).toHaveAttribute('aria-busy', 'true');
    release();
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  });

  it('editar o valor mostra o aviso de reajuste e atualiza a lista', async () => {
    table.seed([makeCategoria({ id: 'p', nome: 'Pizza', valor_unitario: 5 })]);
    const user = abrir();
    await user.click(await screen.findByRole('button', { name: 'Editar Pizza, R$ 5,00' }));
    const sheet = await screen.findByRole('dialog', { name: 'Editar categoria' });
    expect(within(sheet).getByLabelText('Nome')).toHaveValue('Pizza');
    expect(within(sheet).getByLabelText('Valor por entrega (R$)')).toHaveValue('5,00');
    const aviso = 'O novo valor vale para os próximos lançamentos.';
    expect(within(sheet).queryByText(aviso)).not.toBeInTheDocument();

    await preencher(user, { valor: '6,00' });
    expect(within(sheet).getByText(aviso)).toBeInTheDocument();
    await user.click(within(sheet).getByRole('button', { name: 'Salvar' }));
    expect(
      await screen.findByRole('button', { name: 'Editar Pizza, R$ 6,00' }),
    ).toBeInTheDocument();
  });

  it('desativar move para "Inativas" (recolhida) e reativar traz de volta', async () => {
    table.seed([
      makeCategoria({ id: 'p', nome: 'Pizza', valor_unitario: 5 }),
      makeCategoria({ id: 's', nome: 'Sanduíche', valor_unitario: 2.5 }),
    ]);
    const user = abrir();
    await user.click(await screen.findByRole('button', { name: 'Editar Pizza, R$ 5,00' }));
    const sheet = await screen.findByRole('dialog');
    await user.click(within(sheet).getByRole('switch', { name: 'Ativa' }));
    expect(within(sheet).getByRole('switch', { name: 'Ativa' })).toHaveAttribute(
      'aria-checked',
      'false',
    );
    await user.click(within(sheet).getByRole('button', { name: 'Salvar' }));

    const toggle = await screen.findByRole('button', { name: /Inativas \(1\)/ });
    expect(toggle).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByRole('list', { name: 'Categorias inativas' })).not.toBeInTheDocument();
    await user.click(toggle);
    const inativas = screen.getByRole('list', { name: 'Categorias inativas' });
    await user.click(within(inativas).getByRole('button', { name: /Editar Pizza/ }));
    const sheet2 = await screen.findByRole('dialog');
    await user.click(within(sheet2).getByRole('switch', { name: 'Ativa' }));
    await user.click(within(sheet2).getByRole('button', { name: 'Salvar' }));
    await waitFor(() =>
      expect(screen.queryByRole('button', { name: /Inativas/ })).not.toBeInTheDocument(),
    );
    expect(table.rows.find((r) => r.id === 'p')?.ativa).toBe(true);
  });

  it('excluir categoria sem lançamentos pede confirmação e remove', async () => {
    table.seed([
      makeCategoria({ id: 'p', nome: 'Pizza', valor_unitario: 5 }),
      makeCategoria({ id: 's', nome: 'Sanduíche', valor_unitario: 2.5 }),
    ]);
    const user = abrir();
    await user.click(await screen.findByRole('button', { name: 'Editar Pizza, R$ 5,00' }));
    await user.click(
      within(await screen.findByRole('dialog')).getByRole('button', { name: 'Excluir' }),
    );
    const confirm = screen.getByRole('alertdialog', { name: 'Excluir categoria?' });
    await user.click(within(confirm).getByRole('button', { name: 'Excluir' }));
    expect(await screen.findByText('Categoria excluída.')).toBeInTheDocument();
    await waitFor(() =>
      expect(screen.queryByRole('button', { name: /Editar Pizza/ })).not.toBeInTheDocument(),
    );
    expect(table.rows.map((r) => r.id)).toEqual(['s']);
  });

  it('excluir categoria com lançamentos (23503) oferece "Desativar"', async () => {
    table.seed([makeCategoria({ id: 'p', nome: 'Pizza', valor_unitario: 5 })]);
    table.marcarEmUso('p');
    const user = abrir();
    await user.click(await screen.findByRole('button', { name: 'Editar Pizza, R$ 5,00' }));
    await user.click(
      within(await screen.findByRole('dialog')).getByRole('button', { name: 'Excluir' }),
    );
    await user.click(
      within(screen.getByRole('alertdialog', { name: 'Excluir categoria?' })).getByRole('button', {
        name: 'Excluir',
      }),
    );

    const emUso = await screen.findByRole('alertdialog', { name: 'Não dá para excluir' });
    expect(emUso).toHaveAccessibleDescription(
      'Esta categoria já tem lançamentos. Desative-a em vez de excluir.',
    );
    await user.click(within(emUso).getByRole('button', { name: 'Desativar' }));
    expect(await screen.findByText('Categoria desativada.')).toBeInTheDocument();
    expect(table.rows).toEqual([expect.objectContaining({ id: 'p', ativa: false })]);
    expect(await screen.findByRole('button', { name: /Inativas \(1\)/ })).toBeInTheDocument();
  });

  it('erro ao carregar mostra mensagem e permite tentar de novo', async () => {
    table.failNext('PGRST000', 'connection refused');
    const user = abrir();
    expect(
      await screen.findByRole('heading', { name: 'Não foi possível carregar as categorias.' }),
    ).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Tentar de novo' }));
    expect(
      await screen.findByRole('heading', { name: 'Cadastre sua primeira categoria' }),
    ).toBeInTheDocument();
  });
});
