import { useEffect, useId, useRef } from 'react';
import { Button } from './Button';

export type ConfirmDialogProps = {
  open: boolean;
  title: string;
  description?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  variant?: 'danger' | 'primary';
  /** Desabilita os botões e mostra spinner no confirmar (mutation em andamento). */
  loading?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
};

/**
 * Diálogo de confirmação (ex.: antes de excluir). Em telas pequenas aparece
 * como "bottom sheet", perto do polegar. Esc e toque no fundo cancelam.
 */
export function ConfirmDialog({
  open,
  title,
  description,
  confirmLabel = 'Excluir',
  cancelLabel = 'Cancelar',
  variant = 'danger',
  loading = false,
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  const titleId = useId();
  const descId = useId();
  const cancelRef = useRef<HTMLButtonElement>(null);
  // Refs evitam reexecutar o efeito (e roubar o foco) quando o pai recria callbacks.
  const onCancelRef = useRef(onCancel);
  const loadingRef = useRef(loading);
  useEffect(() => {
    onCancelRef.current = onCancel;
    loadingRef.current = loading;
  });

  useEffect(() => {
    if (!open) return;
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    cancelRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !loadingRef.current) onCancelRef.current();
    };
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('keydown', onKey);
      previous?.focus();
    };
  }, [open]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center">
      <div
        className="absolute inset-0 bg-slate-900/50"
        aria-hidden
        onClick={() => !loading && onCancel()}
      />
      <div
        role="alertdialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={description ? descId : undefined}
        className="pb-safe relative w-full max-w-md rounded-t-2xl bg-surface shadow-xl sm:m-4 sm:rounded-2xl"
      >
        <div className="flex flex-col gap-4 p-5">
          <div className="flex flex-col gap-1">
            <h2 id={titleId} className="text-lg font-bold text-slate-900">
              {title}
            </h2>
            {description && (
              <p id={descId} className="text-sm text-slate-600">
                {description}
              </p>
            )}
          </div>
          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <Button
              ref={cancelRef}
              variant="secondary"
              fullWidth
              onClick={onCancel}
              disabled={loading}
            >
              {cancelLabel}
            </Button>
            <Button variant={variant} fullWidth onClick={onConfirm} loading={loading}>
              {confirmLabel}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
