import { useState, type FormEvent } from 'react';
import { Button, PasswordInput, useToast } from '@/components/ui';
import type { UserRef } from '../api';
import { useResetPassword } from '../hooks';
import { fieldErrorsFrom, resetPasswordSchema } from '../schemas';
import { AdminFormAlert } from './AdminFormAlert';
import { AdminSheet } from './AdminSheet';

type ResetPasswordSheetProps = { user: UserRef; onClose: () => void };
type FieldErrors = Partial<Record<'password' | 'confirm', string>>;

/**
 * Define uma nova senha para o usuário (nova + confirmação). Usado pelo admin
 * (Usuários) e pelo gerente/admin na Equipe (spec 010); a Edge Function decide
 * quem pode (403 vira aviso).
 */
export function ResetPasswordSheet({ user, onClose }: ResetPasswordSheetProps) {
  const toast = useToast();
  const reset = useResetPassword();
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [errors, setErrors] = useState<FieldErrors>({});
  const [formError, setFormError] = useState<string | null>(null);

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFormError(null);
    const parsed = resetPasswordSchema.safeParse({ password, confirm });
    if (!parsed.success) {
      setErrors(fieldErrorsFrom<'password' | 'confirm'>(parsed.error));
      return;
    }
    setErrors({});
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
        <PasswordInput
          label="Nova senha"
          name="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          enterKeyHint="next"
          hint="Mínimo de 6 caracteres. Avise a nova senha ao usuário."
          error={errors.password}
          disabled={pending}
        />
        <PasswordInput
          label="Confirmar nova senha"
          name="confirm"
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
          enterKeyHint="done"
          error={errors.confirm}
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
