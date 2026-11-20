import type { ReactNode } from 'react';

type PageHeaderProps = {
  title: string;
  /**
   * Ações à direita do título (ex.: botão "Sair" que a spec 002 adiciona via
   * `AppLayout` → `headerActions`). Use `Button size="icon"` com `aria-label`.
   */
  actions?: ReactNode;
};

/** Cabeçalho compacto e fixo no topo. */
export function PageHeader({ title, actions }: PageHeaderProps) {
  return (
    <header className="pt-safe sticky top-0 z-20 border-b border-slate-200 bg-surface/95 backdrop-blur">
      <div className="mx-auto flex h-14 max-w-md items-center justify-between gap-2 px-4">
        <h1 className="truncate text-lg font-bold text-slate-900">{title}</h1>
        {actions && <div className="flex shrink-0 items-center gap-1">{actions}</div>}
      </div>
    </header>
  );
}
