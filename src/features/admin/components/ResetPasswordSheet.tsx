import { useState, type FormEvent } from 'react';
import { Button, useToast } from '@/components/ui';
import type { AdminUser } from '../api';
import { useResetPassword } from '../hooks';
import { fieldErrorsFrom, resetPasswordSchema } from '../schemas';
import { AdminFormAlert } from './AdminFormAlert';
import { AdminPasswordInput } from './AdminPasswordInput';
import { AdminSheet } from './AdminSheet';

type ResetPasswordSheetProps = { user: AdminUser; onClose: () => void };

/** Define uma nova senha para o usuário. */
export function ResetPasswordSheet({ user, onClose }: ResetPasswordSheetProps) {
  const toast = useToast();
  const reset = useResetPassword();
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | undefined>();
  const [formError, setFormError] = useState<string | null>(null);

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFormError(null);
    const parsed = resetPasswordSchema.safeParse({ password });
    if (!parsed.success) {
      setError(fieldErrorsFrom<'password'>(parsed.error).password);
      return;
    }
    setError(undefined);
    reset.mutate(
      { userId: user.id, password: parsed.data.password },
      {
        onSuccess: () => {
          toast.success(`Senha de ${user.username} redefinida.`);
          onClose();
        },
        onError: (err) => setFormError(err.message),
      },
    );
  }

  const pending = reset.isPending;

  return (
    <AdminSheet
      open
      title="Redefinir senha"
      description={`${user.nome} · @${user.username}`}
      busy={pending}
      onClose={onClose}
    >
      <form noValidate onSubmit={handleSubmit} className="flex flex-col gap-4">
        <AdminPasswordInput
          label="Nova senha"
          name="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          enterKeyHint="done"
          hint="Mínimo de 6 caracteres. Avise a nova senha ao usuário."
          error={error}
          disabled={pending}
        />
        {formError && <AdminFormAlert message={formError} />}
        <Button type="submit" size="lg" fullWidth loading={pending}>
          Salvar senha
        </Button>
      </form>
    </AdminSheet>
  );
}
