import { act, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ToastProvider } from './Toast';
import { useToast } from './toast-context';

function Trigger() {
  const toast = useToast();
  return (
    <>
      <button onClick={() => toast.success('Salvo!')}>ok</button>
      <button onClick={() => toast.error('Falhou')}>erro</button>
    </>
  );
}

describe('Toast', () => {
  afterEach(() => vi.useRealTimers());

  it('mostra sucesso/erro e some sozinho', () => {
    vi.useFakeTimers();
    render(
      <ToastProvider>
        <Trigger />
      </ToastProvider>,
    );
    act(() => screen.getByText('ok').click());
    expect(screen.getByRole('status')).toHaveTextContent('Salvo!');
    act(() => screen.getByText('erro').click());
    expect(screen.getByRole('alert')).toHaveTextContent('Falhou');

    act(() => vi.advanceTimersByTime(3600));
    expect(screen.queryByText('Salvo!')).not.toBeInTheDocument();
    expect(screen.getByText('Falhou')).toBeInTheDocument();
    act(() => vi.advanceTimersByTime(2000));
    expect(screen.queryByText('Falhou')).not.toBeInTheDocument();
  });

  it('useToast fora do provider dá erro claro', () => {
    // Silencia o log esperado do React/jsdom para o erro lançado no render.
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const onError = (e: ErrorEvent) => e.preventDefault();
    window.addEventListener('error', onError);
    expect(() => render(<Trigger />)).toThrow(/ToastProvider/);
    window.removeEventListener('error', onError);
    spy.mockRestore();
  });
});
