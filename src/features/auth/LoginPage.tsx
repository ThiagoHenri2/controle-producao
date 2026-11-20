import { Link } from 'react-router-dom';
import { Truck } from 'lucide-react';
import { Card } from '@/components/ui';

/** Placeholder da tela de login. A spec 002 implementa o formulário e a sessão. */
export function LoginPage() {
  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col justify-center gap-6 px-4 py-8">
      <div className="flex flex-col items-center gap-2 text-center">
        <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-primary text-primary-foreground">
          <Truck className="h-7 w-7" aria-hidden />
        </span>
        <h1 className="text-2xl font-bold">Controle de Entregas</h1>
      </div>
      <Card className="flex flex-col gap-4 text-center">
        <p className="text-slate-700">O login estará disponível em breve.</p>
        <Link
          to="/"
          className="flex min-h-touch items-center justify-center rounded-lg bg-primary px-4 font-semibold text-primary-foreground hover:bg-primary-hover"
        >
          Ir para o app
        </Link>
      </Card>
    </main>
  );
}
