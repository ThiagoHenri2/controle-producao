import type { LucideIcon } from 'lucide-react';
import type { ReactNode } from 'react';

type EmptyStateProps = {
  icon?: LucideIcon;
  title: string;
  description?: string;
  /** Chamada para ação, ex.: <Button>Cadastrar categoria</Button>. */
  action?: ReactNode;
};

export function EmptyState({ icon: Icon, title, description, action }: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center gap-3 px-4 py-10 text-center">
      {Icon && (
        <span className="flex h-14 w-14 items-center justify-center rounded-full bg-primary-soft text-primary">
          <Icon className="h-7 w-7" aria-hidden />
        </span>
      )}
      <h2 className="text-lg font-semibold text-slate-900">{title}</h2>
      {description && <p className="max-w-xs text-sm text-slate-600">{description}</p>}
      {action && <div className="mt-2 w-full max-w-xs">{action}</div>}
    </div>
  );
}
