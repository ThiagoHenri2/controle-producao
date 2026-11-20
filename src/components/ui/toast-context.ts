import { createContext, useContext } from 'react';

export type ToastType = 'success' | 'error' | 'info';

export type ToastInput = {
  message: string;
  type?: ToastType;
  /** Duração em ms (padrão 3500). */
  duration?: number;
};

export type ToastApi = {
  show: (toast: ToastInput) => void;
  success: (message: string) => void;
  error: (message: string) => void;
  dismiss: (id: number) => void;
};

export const ToastContext = createContext<ToastApi | null>(null);

export function useToast(): ToastApi {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast precisa estar dentro de <ToastProvider>.');
  return ctx;
}
