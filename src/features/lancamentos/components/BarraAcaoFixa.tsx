import type { ReactNode } from 'react';
import { useKeyboardInset } from '../useKeyboardInset';

/**
 * Barra fixa acima da BottomNav (ou do teclado, quando aberto) com a ação
 * principal da tela Lançar. A página reserva o espaço dela no fim do conteúdo.
 */
export function BarraAcaoFixa({ children }: { children: ReactNode }) {
  const keyboardInset = useKeyboardInset();
  return (
    <div
      className="fixed inset-x-0 z-20 border-t border-slate-200 bg-surface/95 px-4 py-2 shadow-[0_-4px_12px_rgba(15,23,42,0.08)] backdrop-blur"
      style={{
        bottom:
          keyboardInset > 0 ? `${keyboardInset}px` : 'calc(4rem + env(safe-area-inset-bottom))',
      }}
    >
      <div className="mx-auto flex max-w-md items-center gap-3">{children}</div>
    </div>
  );
}
