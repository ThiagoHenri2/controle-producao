import { useState } from 'react';
import { Plus, Users } from 'lucide-react';
import { Button, ConfirmDialog, EmptyState, SkeletonList, useToast } from '@/components/ui';
import { useAuth } from '@/features/auth/auth-context';
import { ROLE_LABELS } from '@/features/auth/roles';
import type { ProfileRole } from '@/lib/database.types';
import type { AdminUser } from './api';
import { AdminSheet } from './components/AdminSheet';
import { NewUserSheet } from './components/NewUserSheet';
import { ResetPasswordSheet } from './components/ResetPasswordSheet';
import { UserActionsList, type UserAction } from './components/UserActionsList';
import { UserListItem } from './components/UserListItem';
import { useAdminUsers, useSetUserActive, useSetUserRole } from './hooks';

type Confirm =
  { kind: 'active'; user: AdminUser } | { kind: 'role'; user: AdminUser; role: ProfileRole };

function confirmCopy(confirm: Confirm) {
  const { user } = confirm;
  if (confirm.kind === 'active') {
    return user.ativo
      ? {
          title: `Desativar ${user.nome}?`,
          description: 'Ele perde o acesso ao app. Os dados dele ficam guardados.',
          confirmLabel: 'Desativar',
          variant: 'danger' as const,
        }
      : {
          title: `Reativar ${user.nome}?`,
          description: 'Ele volta a entrar com a mesma senha.',
          confirmLabel: 'Reativar',
          variant: 'primary' as const,
        };
  }
  switch (confirm.role) {
    case 'gerente':
      return {
        title: `Tornar ${user.nome} gerente?`,
        description:
          user.role === 'admin'
            ? 'Ele deixa de gerenciar usuários, mas continua vendo e lançando para todos os entregadores.'
            : 'Ele poderá ver quanto pagar a cada entregador, lançar por eles e ajustar as categorias de todos.',
        confirmLabel: 'Tornar gerente',
        variant: 'primary' as const,
      };
    case 'admin':
      return {
        title: `Tornar ${user.nome} admin?`,
        description:
          'Ele poderá fazer tudo o que o gerente faz e também criar, desativar e promover usuários.',
        confirmLabel: 'Tornar admin',
        variant: 'primary' as const,
      };
    case 'user':
      return {
        title: `Tornar ${user.nome} entregador?`,
        description:
          'Ele deixa de ver e de lançar os dados dos outros e passa a ver só os próprios.',
        confirmLabel: 'Tornar entregador',
        variant: 'danger' as const,
      };
  }
}

/** Administração de usuários (spec 006). Só admin chega aqui (AdminRoute). */
export function UsuariosPage() {
  const { profile } = useAuth();
  const toast = useToast();
  const usersQuery = useAdminUsers();
  const setActive = useSetUserActive();
  const setRole = useSetUserRole();

  const [creating, setCreating] = useState(false);
  const [actionsFor, setActionsFor] = useState<AdminUser | null>(null);
  const [resetFor, setResetFor] = useState<AdminUser | null>(null);
  const [confirm, setConfirm] = useState<Confirm | null>(null);

  const confirmPending = setActive.isPending || setRole.isPending;

  function handleAction(action: UserAction) {
    const user = actionsFor;
    if (!user) return;
    setActionsFor(null);
    if (action.type === 'reset_password') setResetFor(user);
    else if (action.type === 'toggle_active') setConfirm({ kind: 'active', user });
    // Nunca sobre si mesmo (o item ⋮ nem aparece para o próprio admin).
    else if (user.id !== profile?.id) setConfirm({ kind: 'role', user, role: action.role });
  }

  function handleConfirm() {
    if (!confirm) return;
    const { user } = confirm;
    const onError = (error: Error) => toast.error(error.message);
    if (confirm.kind === 'active') {
      const ativo = !user.ativo;
      setActive.mutate(
        { userId: user.id, ativo },
        {
          onSuccess: () => {
            toast.success(ativo ? `${user.nome} reativado.` : `${user.nome} desativado.`);
            setConfirm(null);
          },
          onError,
        },
      );
    } else {
      const { role } = confirm;
      setRole.mutate(
        { userId: user.id, role },
        {
          onSuccess: () => {
            toast.success(`${user.nome} agora é ${ROLE_LABELS[role].toLowerCase()}.`);
            setConfirm(null);
          },
          onError,
        },
      );
    }
  }

  const copy = confirm ? confirmCopy(confirm) : null;

  return (
    <div className="flex flex-col gap-4 pb-20">
      {usersQuery.isPending ? (
        <SkeletonList rows={4} label="Carregando usuários…" />
      ) : usersQuery.isError ? (
        <EmptyState
          icon={Users}
          title="Não foi possível carregar os usuários"
          description="Verifique sua conexão e tente de novo."
          action={
            <Button
              variant="secondary"
              fullWidth
              loading={usersQuery.isFetching}
              onClick={() => void usersQuery.refetch()}
            >
              Tentar de novo
            </Button>
          }
        />
      ) : usersQuery.data.length === 0 ? (
        <EmptyState
          icon={Users}
          title="Nenhum usuário ainda"
          description="Cadastre o primeiro entregador para ele poder entrar no app."
        />
      ) : (
        <ul aria-label="Usuários" className="flex flex-col gap-2">
          {usersQuery.data.map((user) => (
            <UserListItem
              key={user.id}
              user={user}
              isSelf={user.id === profile?.id}
              onOpenActions={setActionsFor}
            />
          ))}
        </ul>
      )}

      {/* Ação principal da tela, presa acima da BottomNav. */}
      <div
        className="pointer-events-none fixed inset-x-0 z-20"
        style={{ bottom: 'calc(4rem + env(safe-area-inset-bottom))' }}
      >
        <div className="pointer-events-auto mx-auto w-full max-w-md bg-gradient-to-t from-page via-page/90 to-transparent px-4 pb-3 pt-4">
          <Button
            size="lg"
            fullWidth
            leftIcon={<Plus className="h-5 w-5" aria-hidden />}
            onClick={() => setCreating(true)}
          >
            Novo usuário
          </Button>
        </div>
      </div>

      {creating && <NewUserSheet onClose={() => setCreating(false)} />}

      <AdminSheet
        open={actionsFor !== null}
        title={actionsFor?.nome ?? ''}
        description={actionsFor ? `@${actionsFor.username}` : undefined}
        onClose={() => setActionsFor(null)}
      >
        {actionsFor && <UserActionsList user={actionsFor} onSelect={handleAction} />}
      </AdminSheet>

      {resetFor && <ResetPasswordSheet user={resetFor} onClose={() => setResetFor(null)} />}

      <ConfirmDialog
        open={confirm !== null}
        title={copy?.title ?? ''}
        description={copy?.description}
        confirmLabel={copy?.confirmLabel}
        variant={copy?.variant}
        loading={confirmPending}
        onConfirm={handleConfirm}
        onCancel={() => setConfirm(null)}
      />
    </div>
  );
}
