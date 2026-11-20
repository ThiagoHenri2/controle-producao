import { MoreVertical } from 'lucide-react';
import { PapelBadge } from '@/features/auth/components/PapelBadge';
import { cn } from '@/lib/cn';
import type { AdminUser } from '../api';

type UserListItemProps = {
  user: AdminUser;
  isSelf: boolean;
  /** Atendente: nome do gerente (`null` = sem gerente). */
  gerenteNome?: string | null;
  /** Gerente: nº de atendentes vinculados. */
  atendentes?: number;
  onOpenActions: (user: AdminUser) => void;
};

function textoAtendentes(n: number): string {
  if (n === 0) return 'Sem atendentes';
  return n === 1 ? '1 atendente' : `${n} atendentes`;
}

/** Vínculo da spec 010: "Gerente: X" / "Sem gerente" (atendente) ou "N atendentes" (gerente). */
function vinculo(user: AdminUser, gerenteNome?: string | null, atendentes?: number) {
  if (user.role === 'user') return gerenteNome ? `Gerente: ${gerenteNome}` : 'Sem gerente';
  if (user.role === 'gerente') return textoAtendentes(atendentes ?? 0);
  return null;
}

/** Linha da lista: nome, @usuário, papel, vínculo de gerente, ativo/inativo e menu ⋮. */
export function UserListItem({
  user,
  isSelf,
  gerenteNome,
  atendentes,
  onOpenActions,
}: UserListItemProps) {
  const textoVinculo = vinculo(user, gerenteNome, atendentes);
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
          <PapelBadge role={user.role} />
        </div>
        {textoVinculo && (
          <p className="truncate text-sm text-slate-600" data-testid="usuario-vinculo">
            {textoVinculo}
          </p>
        )}
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
