import type { LucideIcon } from 'lucide-react';
import { KeyRound, ShieldCheck, ShieldOff, UserCheck, UserX } from 'lucide-react';
import { cn } from '@/lib/cn';
import type { AdminUser } from '../api';

export type UserAction = 'reset_password' | 'toggle_active' | 'toggle_role';

type UserActionsListProps = {
  user: AdminUser;
  onSelect: (action: UserAction) => void;
};

type Item = { action: UserAction; label: string; icon: LucideIcon; danger?: boolean };

function itemsFor(user: AdminUser): Item[] {
  return [
    { action: 'reset_password', label: 'Redefinir senha', icon: KeyRound },
    user.ativo
      ? { action: 'toggle_active', label: 'Desativar', icon: UserX, danger: true }
      : { action: 'toggle_active', label: 'Reativar', icon: UserCheck },
    user.role === 'admin'
      ? { action: 'toggle_role', label: 'Tornar usuário comum', icon: ShieldOff, danger: true }
      : { action: 'toggle_role', label: 'Tornar admin', icon: ShieldCheck },
  ];
}

/** Lista de ações do menu ⋮ (renderizada dentro de um AdminSheet). */
export function UserActionsList({ user, onSelect }: UserActionsListProps) {
  return (
    <ul className="-mx-2 flex flex-col">
      {itemsFor(user).map(({ action, label, icon: Icon, danger }) => (
        <li key={action}>
          <button
            type="button"
            onClick={() => onSelect(action)}
            className={cn(
              'flex min-h-[52px] w-full items-center gap-3 rounded-lg px-3 text-left text-base font-medium hover:bg-slate-100',
              danger ? 'text-danger' : 'text-slate-900',
            )}
          >
            <Icon className="h-5 w-5 shrink-0" aria-hidden />
            {label}
          </button>
        </li>
      ))}
    </ul>
  );
}
