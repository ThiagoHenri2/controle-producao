import { useState, type FormEvent } from 'react';
import { Navigate } from 'react-router-dom';
import { AlertCircle, Eye, EyeOff, Truck } from 'lucide-react';
import { z } from 'zod';
import { Button, Card, Input } from '@/components/ui';
import { AUTH_MESSAGES, SignInError } from '@/lib/auth';
import { ROUTES } from '@/routes/navigation';
import { useAuth } from './auth-context';
import { AuthLoadingScreen } from './components/AuthLoadingScreen';

const loginSchema = z.object({
  username: z.string().trim().min(1, 'Informe o usuário.'),
  password: z.string().min(1, 'Informe a senha.'),
});

type LoginFields = z.infer<typeof loginSchema>;
type FieldErrors = Partial<Record<keyof LoginFields, string>>;

export function LoginPage() {
  const { isAuthenticated, loading, signIn } = useAuth();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  if (isAuthenticated) return <Navigate to={ROUTES.lancar} replace />;
  // Durante o envio, o perfil também fica "carregando"; não troque o formulário pelo spinner.
  if (loading && !submitting) return <AuthLoadingScreen />;

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFormError(null);

    const parsed = loginSchema.safeParse({ username, password });
    if (!parsed.success) {
      const errors: FieldErrors = {};
      for (const issue of parsed.error.issues) {
        const field = issue.path[0];
        if ((field === 'username' || field === 'password') && !errors[field]) {
          errors[field] = issue.message;
        }
      }
      setFieldErrors(errors);
      return;
    }
    setFieldErrors({});

    setSubmitting(true);
    try {
      await signIn(parsed.data.username, parsed.data.password);
      // Sucesso: o <Navigate> acima redireciona quando o perfil ativo carregar.
    } catch (err) {
      setFormError(err instanceof SignInError ? err.message : AUTH_MESSAGES.unexpected);
      setPassword('');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-md flex-col justify-center gap-6 px-4 py-8">
      <div className="flex flex-col items-center gap-2 text-center">
        <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-primary text-primary-foreground">
          <Truck className="h-7 w-7" aria-hidden />
        </span>
        <h1 className="text-2xl font-bold text-slate-900">Entregas</h1>
        <p className="text-slate-600">Controle de produção</p>
      </div>

      <Card>
        <form noValidate onSubmit={handleSubmit} className="flex flex-col gap-4">
          <Input
            label="Usuário"
            name="username"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            autoCapitalize="none"
            autoCorrect="off"
            autoComplete="username"
            spellCheck={false}
            enterKeyHint="next"
            error={fieldErrors.username}
            disabled={submitting}
          />
          <Input
            label="Senha"
            name="password"
            type={showPassword ? 'text' : 'password'}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="current-password"
            enterKeyHint="go"
            error={fieldErrors.password}
            disabled={submitting}
            endAdornment={
              <button
                type="button"
                onClick={() => setShowPassword((v) => !v)}
                aria-label={showPassword ? 'Ocultar senha' : 'Mostrar senha'}
                aria-pressed={showPassword}
                className="flex h-11 w-11 items-center justify-center rounded-lg text-slate-600 hover:bg-slate-100"
              >
                {showPassword ? (
                  <EyeOff className="h-5 w-5" aria-hidden />
                ) : (
                  <Eye className="h-5 w-5" aria-hidden />
                )}
              </button>
            }
          />

          {formError && (
            <div
              role="alert"
              className="flex items-start gap-2 rounded-lg border border-danger/30 bg-red-50 p-3 text-sm font-medium text-danger"
            >
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
              <p>{formError}</p>
            </div>
          )}

          <Button type="submit" size="lg" fullWidth loading={submitting}>
            Entrar
          </Button>
        </form>
      </Card>
    </main>
  );
}
