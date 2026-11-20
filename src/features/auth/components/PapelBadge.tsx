import type { ProfileRole } from '@/lib/database.types';
import { cn } from '@/lib/cn';
import { ROLE_LABELS } from '../roles';

const STYLES: Record<ProfileRole, string> = {
  user: 'bg-slate-100 text-slate-700',
  gerente: 'bg-indigo-100 text-indigo-800',
  admin: 'bg-primary-soft text-primary-hover',
};

/** Selo "Entregador" / "Gerente" / "Admin". */
export function PapelBadge({ role, className }: { role: ProfileRole; className?: string }) {
  return (
    <span
      className={cn(
        'shrink-0 rounded-full px-2 py-0.5 text-xs font-semibold',
        STYLES[role],
        className,
      )}
    >
      {ROLE_LABELS[role]}
    </span>
  );
}

/** Selo "Inativo". */
export function InativoBadge({ className }: { className?: string }) {
  return (
    <span
      className={cn(
        'shrink-0 rounded-full border border-slate-300 px-2 py-0.5 text-xs font-medium text-slate-600',
        className,
      )}
    >
      Inativo
    </span>
  );
}
