import { useEffect, useId, useRef, type ReactNode } from 'react';
import { X } from 'lucide-react';

type AdminSheetProps = {
  open: boolean;
  title: string;
  description?: string;
  /** Bloqueia o fechamento (Esc, fundo, X) enquanto uma mutation roda. */
  busy?: boolean;
  onClose: () => void;
  children: ReactNode;
};

/**
 * "Bottom sheet" modal usado só na administração de usuários. No celular fica
 * colado embaixo (perto do polegar); em telas maiores vira um card central.
 */
export function AdminSheet({
  open,
  title,
  description,
  busy = false,
  onClose,
  children,
}: AdminSheetProps) {
  const titleId = useId();
  const descId = useId();
  const panelRef = useRef<HTMLDivElement>(null);
  const onCloseRef = useRef(onClose);
  const busyRef = useRef(busy);
  useEffect(() => {
    onCloseRef.current = onClose;
    busyRef.current = busy;
  });

  useEffect(() => {
    if (!open) return;
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const first = panelRef.current?.querySelector<HTMLElement>(
      'input, [data-autofocus], button:not([data-sheet-close])',
    );
    (first ?? panelRef.current)?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !busyRef.current) onCloseRef.current();
    };
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('keydown', onKey);
      previous?.focus();
    };
  }, [open]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-40 flex items-end justify-center sm:items-center">
      <div
        className="absolute inset-0 bg-slate-900/50"
        aria-hidden
        onClick={() => !busy && onClose()}
      />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={description ? descId : undefined}
        tabIndex={-1}
        className="pb-safe relative flex max-h-[90dvh] w-full max-w-md flex-col rounded-t-2xl bg-surface shadow-xl outline-none sm:m-4 sm:rounded-2xl"
      >
        <div className="flex items-start justify-between gap-2 px-5 pb-2 pt-4">
          <div className="flex min-w-0 flex-col gap-0.5 pt-2">
            <h2 id={titleId} className="truncate text-lg font-bold text-slate-900">
              {title}
            </h2>
            {description && (
              <p id={descId} className="truncate text-sm text-slate-600">
                {description}
              </p>
            )}
          </div>
          <button
            type="button"
            data-sheet-close
            onClick={onClose}
            disabled={busy}
            aria-label="Fechar"
            className="-mr-2 flex h-11 w-11 shrink-0 items-center justify-center rounded-lg text-slate-600 hover:bg-slate-100 disabled:opacity-40"
          >
            <X className="h-5 w-5" aria-hidden />
          </button>
        </div>
        <div className="overflow-y-auto px-5 pb-5">{children}</div>
      </div>
    </div>
  );
}
