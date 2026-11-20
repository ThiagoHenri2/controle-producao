import { useId, useState, type FormEvent } from 'react';
import { Button, Card, PasswordInput, useToast } from '@/components/ui';
import { AdminFormAlert } from '@/features/admin/components/AdminFormAlert';
import { fieldErrorsFrom } from '@/features/admin/schemas';
import { useChangePassword } from '../hooks';
import { changePasswordSchema, type ChangePasswordInput } from '../schemas';

type FieldErrors = Partial<Record<keyof ChangePasswordInput, string>>;

/**
 * "Trocar senha" (spec 010): senha atual, nova e confirmação. A atual é
 * conferida com um novo login antes de gravar a nova.
 */
export function TrocarSenhaForm({ username }: { username: string }) {
  const titleId = useId();
  const toast = useToast();
  const change = useChangePassword();
  const [atual, setAtual] = useState('');
  const [nova, setNova] = useState('');
  const [confirmacao, setConfirmacao] = useState('');
  const [errors, setErrors] = useState<FieldErrors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const pending = change.isPending;

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFormError(null);
    const parsed = changePasswordSchema.safeParse({ atual, nova, confirmacao });
    if (!parsed.success) {
      setErrors(fieldErrorsFrom<keyof ChangePasswordInput>(parsed.error));
      return;
    }
    setErrors({});
    change.mutate(
      { username, atual: parsed.data.atual, nova: parsed.data.nova },
      {
        onSuccess: () => {
          toast.success('Senha alterada.');
          setAtual('');
          setNova('');
          setConfirmacao('');
        },
        onError: (err) => {
          if (err.field) setErrors({ [err.field]: err.message });
          else setFormError(err.message);
        },
      },
    );
  }

  return (
    <Card>
      <section aria-labelledby={titleId} className="flex flex-col gap-4">
        <h2 id={titleId} className="text-base font-bold text-slate-900">
          Trocar senha
        </h2>
        <form noValidate onSubmit={handleSubmit} className="flex flex-col gap-4">
          <PasswordInput
            label="Senha atual"
            name="atual"
            value={atual}
            onChange={(e) => setAtual(e.target.value)}
            autoComplete="current-password"
            enterKeyHint="next"
            error={errors.atual}
            disabled={pending}
          />
          <PasswordInput
            label="Nova senha"
            name="nova"
            value={nova}
            onChange={(e) => setNova(e.target.value)}
            enterKeyHint="next"
            hint="Mínimo de 6 caracteres."
            error={errors.nova}
            disabled={pending}
          />
          <PasswordInput
            label="Confirmar nova senha"
            name="confirmacao"
            value={confirmacao}
            onChange={(e) => setConfirmacao(e.target.value)}
            enterKeyHint="done"
            error={errors.confirmacao}
            disabled={pending}
          />
          {formError && <AdminFormAlert message={formError} />}
          <Button type="submit" size="lg" fullWidth loading={pending}>
            Salvar nova senha
          </Button>
        </form>
      </section>
    </Card>
  );
}
