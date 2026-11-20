import { useEffect, useState } from 'react';

/**
 * Altura (px) do teclado virtual, via `visualViewport`. No Android, elementos
 * `fixed` ficam atrás do teclado; com esse valor a barra de Salvar sobe junto.
 * (Mesma técnica do `BottomSheet`; candidata a ir para `components/ui`.)
 */
export function useKeyboardInset(): number {
  const [inset, setInset] = useState(0);
  useEffect(() => {
    const vv = typeof window !== 'undefined' ? window.visualViewport : null;
    if (!vv) return;
    const update = () =>
      setInset(Math.max(0, Math.round(window.innerHeight - vv.height - vv.offsetTop)));
    update();
    vv.addEventListener('resize', update);
    vv.addEventListener('scroll', update);
    return () => {
      vv.removeEventListener('resize', update);
      vv.removeEventListener('scroll', update);
    };
  }, []);
  // Diferenças pequenas (barra de endereço) não são teclado.
  return inset > 80 ? inset : 0;
}
