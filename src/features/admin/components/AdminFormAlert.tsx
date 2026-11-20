import { AlertCircle } from 'lucide-react';

/** Erro do formulário (vindo do servidor), anunciado a leitores de tela. */
export function AdminFormAlert({ message }: { message: string }) {
  return (
    <div
      role="alert"
      className="flex items-start gap-2 rounded-lg border border-danger/30 bg-red-50 p-3 text-sm font-medium text-danger"
    >
      <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
      <p>{message}</p>
    </div>
  );
}
