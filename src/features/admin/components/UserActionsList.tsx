import type { LucideIcon } from 'lucide-react';
import { Bike, KeyRound, ShieldCheck, UserCheck, UserX, Wallet } from 'lucide-react';
import { cn } from '@/lib/cn';
import type { ProfileRole } from '@/lib/database.types';
import type { AdminUser } from '../api';

export type UserAction =
  { type: 'reset_password' } | { type: 'toggle_active' } | { type: 'set_role'; role: ProfileRole };

type UserActionsListProps = {
  user: AdminUser;
  onSelect: (action: UserAction) => void;
};

type Item = { key: string; action: UserAction; label: string; icon: LucideIcon; danger?: boolean };

/** Papéis que o usuário pode receber (todos menos o atual), na ordem gerente · admin · entregador. */
const ROLE_ITEMS: ReadonlyArray<{ role: ProfileRole; label: string; icon: LucideIcon }> = [
  { role: 'gerente', label: 'Tornar gerente', icon: Wallet },
  { role: 'admin', label: 'Tornar admin', icon: ShieldCheck },
  { role: 'user', label: 'Tornar entregador', icon: Bike },
];

function itemsFor(user: AdminUser): Item[] {
  const items: Item[] = [
    { key: 'reset', action: { type: 'reset_password' }, label: 'Redefinir senha', icon: KeyRound },
    user.ativo
      ? {
          key: 'active',
          action: { type: 'toggle_active' },
          label: 'Desativar',
          icon: UserX,
          danger: true,
        }
      : { key: 'active', action: { type: 'toggle_active' }, label: 'Reativar', icon: UserCheck },
  ];
  for (const { role, label, icon } of ROLE_ITEMS) {
    if (role === user.role) continue;
    items.push({
      key: `role-${role}`,
      action: { type: 'set_role', role },
      label,
      icon,
      // Rebaixar a entregador tira poderes: destaque de perigo.
      danger: role === 'user',
    });
  }
  return items;
}

/** Lista de ações do menu ⋮ (renderizada dentro de um AdminSheet). */
export function UserActionsList({ user, onSelect }: UserActionsListProps) {
  return (
    <ul className="-mx-2 flex flex-col">
      {itemsFor(user).map(({ key, action, label, icon: Icon, danger }) => (
        <li key={key}>
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
