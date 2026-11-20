import { useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { X } from 'lucide-react';

export type BottomSheetProps = {
  open: boolean;
  title: string;
  /** Fecha o sheet (Esc, toque no fundo ou botão X). */
  onClose: () => void;
  /** Rodapé fixo do sheet (ex.: botões Excluir/Salvar). Fica acima do teclado. */
  footer?: ReactNode;
  /** Impede fechar (ex.: mutation em andamento). */
  closeDisabled?: boolean;
  children: ReactNode;
};

/**
 * Altura do teclado virtual (px). Usa a `visualViewport` para que o rodapé do
 * sheet suba junto com o teclado no Android em vez de ficar escondido.
 */
function useKeyboardInset(active: boolean): number {
  const [inset, setInset] = useState(0);
  useEffect(() => {
    const vv = typeof window !== 'undefined' ? window.visualViewport : null;
    if (!active || !vv) return;
    const update = () =>
      setInset(Math.max(0, Math.round(window.innerHeight - vv.height - vv.offsetTop)));
    update();
    vv.addEventListener('resize', update);
    vv.addEventListener('scroll', update);
    return () => {
      vv.removeEventListener('resize', update);
      vv.removeEventListener('scroll', update);
      setInset(0);
    };
  }, [active]);
  return inset;
}

/**
 * Painel que sobe do rodapé (mobile) ou aparece centralizado (telas maiores).
 * O conteúdo rola; o `footer` fica sempre visível. Foca o primeiro campo ao abrir
 * e devolve o foco ao elemento anterior ao fechar.
 */
export function BottomSheet({
  open,
  title,
  onClose,
  footer,
  closeDisabled = false,
  children,
}: BottomSheetProps) {
  const titleId = useId();
  const panelRef = useRef<HTMLDivElement>(null);
  const onCloseRef = useRef(onClose);
  const closeDisabledRef = useRef(closeDisabled);
  useEffect(() => {
    onCloseRef.current = onClose;
    closeDisabledRef.current = closeDisabled;
  });
  const keyboardInset = useKeyboardInset(open);

  useEffect(() => {
    if (!open) return;
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const panel = panelRef.current;
    const first = panel?.querySelector<HTMLElement>('input, select, textarea');
    (first ?? panel)?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !closeDisabledRef.current) onCloseRef.current();
    };
    document.addEventListener('keydown', onKey);
    const overflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = overflow;
      previous?.focus();
    };
  }, [open]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-x-0 top-0 z-40 flex items-end justify-center sm:items-center"
      style={{ bottom: keyboardInset }}
    >
      <div
        className="absolute inset-0 bg-slate-900/50"
        aria-hidden
        onClick={() => !closeDisabled && onClose()}
      />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        className="pb-safe relative flex max-h-[90dvh] w-full max-w-md flex-col rounded-t-2xl bg-surface shadow-xl focus:outline-none sm:m-4 sm:rounded-2xl"
      >
        <div className="flex items-center justify-between gap-2 border-b border-slate-200 py-1 pl-5 pr-2">
          <h2 id={titleId} className="text-lg font-bold text-slate-900">
            {title}
          </h2>
          <button
            type="button"
            onClick={onClose}
            disabled={closeDisabled}
            aria-label="Fechar"
            className="flex h-11 w-11 items-center justify-center rounded-lg text-slate-600 hover:bg-slate-100 disabled:opacity-40"
          >
            <X className="h-5 w-5" aria-hidden />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto px-5 py-4">{children}</div>
        {footer && <div className="border-t border-slate-200 px-5 py-3">{footer}</div>}
      </div>
    </div>
  );
}
