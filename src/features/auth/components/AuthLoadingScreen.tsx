import { Spinner } from '@/components/ui';

/** Tela exibida enquanto a sessão inicial é resolvida (evita piscar o login). */
export function AuthLoadingScreen() {
  return (
    <main className="flex min-h-dvh items-center justify-center text-primary">
      <Spinner className="h-8 w-8" label="Carregando" />
    </main>
  );
}
