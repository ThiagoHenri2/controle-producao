import { useState, type FormEvent } from 'react';
import { Button, Input, Select, useToast } from '@/components/ui';
import { ROLES, ROLE_LABELS } from '@/features/auth/roles';
import type { ProfileRole } from '@/lib/database.types';
import { useCreateUser } from '../hooks';
import { fieldErrorsFrom, newUserSchema, normalizeUsername, type NewUserInput } from '../schemas';
import { AdminFormAlert } from './AdminFormAlert';
import { AdminPasswordInput } from './AdminPasswordInput';
import { AdminSheet } from './AdminSheet';

type FieldErrors = Partial<Record<keyof NewUserInput, string>>;

type NewUserSheetProps = { onClose: () => void };

const ROLE_OPTIONS = ROLES.map((r) => ({ value: r, label: ROLE_LABELS[r] }));

/** Sheet "Novo usuário": nome, usuário (login), senha inicial e papel. */
export function NewUserSheet({ onClose }: NewUserSheetProps) {
  const toast = useToast();
  const createUser = useCreateUser();
  const [nome, setNome] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [role, setRole] = useState<ProfileRole>('user');
  const [errors, setErrors] = useState<FieldErrors>({});
  const [formError, setFormError] = useState<string | null>(null);

  const preview = normalizeUsername(username);

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFormError(null);
    const parsed = newUserSchema.safeParse({ nome, username, password, role });
    if (!parsed.success) {
      setErrors(fieldErrorsFrom<keyof NewUserInput>(parsed.error));
      return;
    }
    setErrors({});
    createUser.mutate(parsed.data, {
      onSuccess: () => {
        toast.success(`Usuário ${parsed.data.username} criado.`);
        onClose();
      },
      onError: (error) => {
        if (error.status === 409) setErrors({ username: error.message });
        else setFormError(error.message);
      },
    });
  }

  const pending = createUser.isPending;

  return (
    <AdminSheet open title="Novo usuário" busy={pending} onClose={onClose}>
      <form noValidate onSubmit={handleSubmit} className="flex flex-col gap-4">
        <Input
          label="Nome"
          name="nome"
          value={nome}
          onChange={(e) => setNome(e.target.value)}
          autoComplete="off"
          autoCapitalize="words"
          enterKeyHint="next"
          maxLength={80}
          error={errors.nome}
          disabled={pending}
        />
        <Input
          label="Usuário"
          name="username"
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          autoComplete="off"
          autoCapitalize="none"
          autoCorrect="off"
          spellCheck={false}
          enterKeyHint="next"
          maxLength={40}
          hint={
            preview
              ? `O login do usuário será: ${preview}`
              : 'Letras minúsculas, números, ponto, hífen ou _.'
          }
          error={errors.username}
          disabled={pending}
        />
        <AdminPasswordInput
          label="Senha"
          name="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          enterKeyHint="done"
          hint="Mínimo de 6 caracteres."
          error={errors.password}
          disabled={pending}
        />

        <Select
          label="Papel"
          name="role"
          value={role}
          onChange={(e) => setRole(e.target.value as ProfileRole)}
          options={ROLE_OPTIONS}
          hint={
            role === 'user'
              ? 'Entregador: vê só os próprios dados.'
              : role === 'gerente'
                ? 'Gerente: vê quanto pagar a cada entregador e lança por eles.'
                : 'Admin: tudo do gerente e também gerencia usuários.'
          }
          error={errors.role}
          disabled={pending}
        />

        {formError && <AdminFormAlert message={formError} />}

        <Button type="submit" size="lg" fullWidth loading={pending}>
          Criar
        </Button>
      </form>
    </AdminSheet>
  );
}
