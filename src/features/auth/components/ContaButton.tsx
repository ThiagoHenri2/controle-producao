import { Link, useLocation } from 'react-router-dom';
import { CircleUser } from 'lucide-react';
import { cn } from '@/lib/cn';
import { ROUTES } from '@/routes/navigation';

/** Ícone do cabeçalho que abre Minha conta (spec 010), ao lado do Sair. */
export function ContaButton() {
  const { pathname } = useLocation();
  const ativo = pathname === ROUTES.conta;
  return (
    <Link
      to={ROUTES.conta}
      aria-label="Minha conta"
      title="Minha conta"
      aria-current={ativo ? 'page' : undefined}
      className={cn(
        'inline-flex min-h-touch min-w-touch items-center justify-center rounded-lg p-2 hover:bg-slate-100 active:bg-slate-200',
        'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary',
        ativo ? 'text-primary' : 'text-slate-700',
      )}
    >
      <CircleUser className="h-5 w-5" aria-hidden />
    </Link>
  );
}
