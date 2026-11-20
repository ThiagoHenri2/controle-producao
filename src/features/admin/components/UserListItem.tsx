import { MoreVertical } from 'lucide-react';
import { cn } from '@/lib/cn';
import type { AdminUser } from '../api';

type UserListItemProps = {
  user: AdminUser;
  isSelf: boolean;
  onOpenActions: (user: AdminUser) => void;
};

function roleLabel(role: AdminUser['role']): string {
  return role === 'admin' ? 'Admin' : 'Usuário';
}

/** Linha da lista: nome, @usuário, papel, ativo/inativo e menu ⋮. */
export function UserListItem({ user, isSelf, onOpenActions }: UserListItemProps) {
  return (
    <li className="flex items-center gap-2 rounded-xl border border-slate-200 bg-surface py-2 pl-4 pr-1 shadow-sm">
      <div className="flex min-w-0 flex-1 flex-col gap-0.5 py-1">
        <div className="flex min-w-0 items-baseline gap-2">
          <span
            className={cn(
              'truncate font-semibold',
              user.ativo ? 'text-slate-900' : 'text-slate-500',
            )}
          >
            {user.nome}
          </span>
          {isSelf && <span className="shrink-0 text-xs font-medium text-slate-600">(você)</span>}
        </div>
        <div className="flex min-w-0 items-center gap-2 text-sm text-slate-600">
          <span className="truncate">@{user.username}</span>
          <span aria-hidden>·</span>
          <span
            className={cn(
              'shrink-0 rounded-full px-2 py-0.5 text-xs font-semibold',
              user.role === 'admin'
                ? 'bg-primary-soft text-primary-hover'
                : 'bg-slate-100 text-slate-700',
            )}
          >
            {roleLabel(user.role)}
          </span>
        </div>
      </div>

      <span className="flex shrink-0 items-center gap-1.5 text-xs font-medium text-slate-600">
        <span
          aria-hidden
          className={cn(
            'h-3 w-3 rounded-full border-2',
            user.ativo ? 'border-success bg-success' : 'border-slate-400 bg-transparent',
          )}
        />
        {user.ativo ? 'Ativo' : 'Inativo'}
      </span>

      {isSelf ? (
        // Mantém o alinhamento: o admin não age sobre si mesmo por aqui.
        <span className="w-11 shrink-0" aria-hidden />
      ) : (
        <button
          type="button"
          onClick={() => onOpenActions(user)}
          aria-label={`Ações de ${user.nome}`}
          aria-haspopup="dialog"
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg text-slate-600 hover:bg-slate-100"
        >
          <MoreVertical className="h-5 w-5" aria-hidden />
        </button>
      )}
    </li>
  );
}
