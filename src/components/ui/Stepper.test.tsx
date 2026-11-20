import { useState } from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { Stepper } from './Stepper';

function Controlled({
  initial = 0,
  onChange,
  max,
}: {
  initial?: number;
  onChange?: (n: number) => void;
  max?: number;
}) {
  const [value, setValue] = useState(initial);
  return (
    <Stepper
      label="X-Burguer"
      value={value}
      max={max}
      onChange={(n) => {
        setValue(n);
        onChange?.(n);
      }}
    />
  );
}

describe('Stepper', () => {
  it('incrementa e decrementa com + e −', async () => {
    const user = userEvent.setup();
    render(<Controlled initial={1} />);
    const input = screen.getByLabelText('X-Burguer');
    await user.click(screen.getByRole('button', { name: 'Aumentar X-Burguer' }));
    await user.click(screen.getByRole('button', { name: 'Aumentar X-Burguer' }));
    expect(input).toHaveValue('3');
    await user.click(screen.getByRole('button', { name: 'Diminuir X-Burguer' }));
    expect(input).toHaveValue('2');
  });

  it('não passa do mínimo 0 (botão − desabilitado em 0)', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<Controlled initial={1} onChange={onChange} />);
    const menos = screen.getByRole('button', { name: 'Diminuir X-Burguer' });
    await user.click(menos);
    expect(screen.getByLabelText('X-Burguer')).toHaveValue('0');
    expect(menos).toBeDisabled();
    await user.click(menos);
    expect(onChange).toHaveBeenLastCalledWith(0);
    expect(onChange).not.toHaveBeenCalledWith(-1);
  });

  it('aceita digitação e ignora caracteres não numéricos', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<Controlled onChange={onChange} />);
    const input = screen.getByLabelText('X-Burguer');
    await user.clear(input);
    await user.type(input, '1a2');
    expect(input).toHaveValue('12');
    expect(onChange).toHaveBeenLastCalledWith(12);
    await user.click(screen.getByRole('button', { name: 'Aumentar X-Burguer' }));
    expect(input).toHaveValue('13');
  });

  it('campo vazio vale o mínimo e volta a mostrar 0 ao sair', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<Controlled initial={5} onChange={onChange} />);
    const input = screen.getByLabelText('X-Burguer');
    await user.clear(input);
    expect(input).toHaveValue('');
    expect(onChange).toHaveBeenLastCalledWith(0);
    await user.tab();
    expect(input).toHaveValue('0');
  });

  it('não ultrapassa o máximo', async () => {
    const user = userEvent.setup();
    render(<Controlled initial={2} max={3} />);
    const mais = screen.getByRole('button', { name: 'Aumentar X-Burguer' });
    await user.click(mais);
    expect(mais).toBeDisabled();
    const input = screen.getByLabelText('X-Burguer');
    await user.clear(input);
    await user.type(input, '50');
    expect(input).toHaveValue('3');
  });

  it('usa teclado numérico no celular', () => {
    render(<Controlled />);
    expect(screen.getByLabelText('X-Burguer')).toHaveAttribute('inputmode', 'numeric');
  });
});
