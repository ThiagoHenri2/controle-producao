import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { Button } from './Button';

describe('Button', () => {
  it('chama onClick quando clicado', async () => {
    const onClick = vi.fn();
    render(<Button onClick={onClick}>Salvar</Button>);
    await userEvent.click(screen.getByRole('button', { name: 'Salvar' }));
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it('loading desabilita o botão, marca aria-busy e não dispara onClick', async () => {
    const onClick = vi.fn();
    render(
      <Button loading onClick={onClick}>
        Salvar
      </Button>,
    );
    const btn = screen.getByRole('button', { name: 'Salvar' });
    expect(btn).toBeDisabled();
    expect(btn).toHaveAttribute('aria-busy', 'true');
    await userEvent.click(btn);
    expect(onClick).not.toHaveBeenCalled();
  });

  it('usa type="button" por padrão (não envia formulário sem querer)', () => {
    render(<Button>Ok</Button>);
    expect(screen.getByRole('button')).toHaveAttribute('type', 'button');
  });

  it('aplica a variante e a altura mínima de toque', () => {
    render(<Button variant="danger">Excluir</Button>);
    const btn = screen.getByRole('button', { name: 'Excluir' });
    expect(btn.className).toContain('bg-danger');
    expect(btn.className).toContain('min-h-touch');
  });
});
