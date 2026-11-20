import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { ConfirmDialog } from './ConfirmDialog';

describe('ConfirmDialog', () => {
  it('não renderiza quando fechado', () => {
    render(<ConfirmDialog open={false} title="Excluir?" onConfirm={vi.fn()} onCancel={vi.fn()} />);
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
  });

  it('foca em Cancelar, confirma e cancela (inclusive com Esc)', async () => {
    const user = userEvent.setup();
    const onConfirm = vi.fn();
    const onCancel = vi.fn();
    render(
      <ConfirmDialog
        open
        title="Excluir categoria?"
        description="Essa ação não pode ser desfeita."
        onConfirm={onConfirm}
        onCancel={onCancel}
      />,
    );
    const dialog = screen.getByRole('alertdialog', { name: 'Excluir categoria?' });
    expect(dialog).toHaveAccessibleDescription('Essa ação não pode ser desfeita.');
    expect(screen.getByRole('button', { name: 'Cancelar' })).toHaveFocus();

    await user.click(screen.getByRole('button', { name: 'Excluir' }));
    expect(onConfirm).toHaveBeenCalledTimes(1);

    await user.keyboard('{Escape}');
    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  it('loading desabilita os dois botões', () => {
    render(<ConfirmDialog open loading title="Excluir?" onConfirm={vi.fn()} onCancel={vi.fn()} />);
    expect(screen.getByRole('button', { name: 'Cancelar' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Excluir' })).toBeDisabled();
  });
});
