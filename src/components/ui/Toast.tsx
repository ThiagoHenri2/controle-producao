import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { CheckCircle2, Info, X, XCircle } from 'lucide-react';
import { cn } from '@/lib/cn';
import { ToastContext, type ToastApi, type ToastInput, type ToastType } from './toast-context';

type ToastItem = { id: number; message: string; type: ToastType };

const icons = { success: CheckCircle2, error: XCircle, info: Info } as const;
const accents: Record<ToastType, string> = {
  success: 'border-l-success text-success',
  error: 'border-l-danger text-danger',
  info: 'border-l-primary text-primary',
};

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const nextId = useRef(1);
  const timers = useRef(new Map<number, ReturnType<typeof setTimeout>>());

  const dismiss = useCallback((id: number) => {
    setToasts((list) => list.filter((t) => t.id !== id));
    const timer = timers.current.get(id);
    if (timer) clearTimeout(timer);
    timers.current.delete(id);
  }, []);

  const show = useCallback(
    ({ message, type = 'info', duration = 3500 }: ToastInput) => {
      const id = nextId.current++;
      // Mantém no máximo 3 avisos na tela.
      setToasts((list) => [...list.slice(-2), { id, message, type }]);
      timers.current.set(
        id,
        setTimeout(() => dismiss(id), duration),
      );
    },
    [dismiss],
  );

  useEffect(() => {
    const map = timers.current;
    return () => {
      map.forEach((t) => clearTimeout(t));
      map.clear();
    };
  }, []);

  const api = useMemo<ToastApi>(
    () => ({
      show,
      dismiss,
      success: (message) => show({ message, type: 'success' }),
      error: (message) => show({ message, type: 'error', duration: 5000 }),
    }),
    [show, dismiss],
  );

  return (
    <ToastContext.Provider value={api}>
      {children}
      {/*
        No topo, logo abaixo do PageHeader (h-14 + safe area), para não cobrir os
        botões fixos acima da BottomNav (Salvar, Nova categoria).
      */}
      <div
        aria-live="polite"
        data-testid="toast-container"
        className="pointer-events-none fixed inset-x-0 z-50 flex flex-col items-center gap-2 px-4"
        style={{ top: 'calc(3.5rem + env(safe-area-inset-top) + 0.5rem)' }}
      >
        {toasts.map((t) => {
          const Icon = icons[t.type];
          return (
            <div
              key={t.id}
              role={t.type === 'error' ? 'alert' : 'status'}
              className={cn(
                'pointer-events-auto flex w-full max-w-md items-center gap-3 rounded-xl border border-l-4 border-slate-200 bg-surface py-2 pl-3 pr-1 shadow-lg',
                accents[t.type],
              )}
            >
              <Icon className="h-5 w-5 shrink-0" aria-hidden />
              <p className="flex-1 text-sm font-medium text-slate-900">{t.message}</p>
              <button
                type="button"
                onClick={() => dismiss(t.id)}
                aria-label="Fechar aviso"
                className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg text-slate-500 hover:bg-slate-100"
              >
                <X className="h-4 w-4" aria-hidden />
              </button>
            </div>
          );
        })}
      </div>
    </ToastContext.Provider>
  );
}
